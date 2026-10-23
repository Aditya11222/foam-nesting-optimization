"""
Domain models and Pydantic schemas for the 3D Foam Nesting & Cutting Optimization engine.
All dimensions snap to 1/16" precision on creation.
"""

from typing import List, Optional, Tuple, Dict, Any, Literal
from enum import Enum
from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator, model_validator
from .units import snap_to_16th, format_fraction_16th, SIXTEENTH_INCH


class OrientationMode(str, Enum):
    RISE_LOCKED = "rise-locked"       # Default: Z height locked, up to 2 rotations in XY
    FREE_IN_PLANE = "free-in-plane"   # Rotate about vertical Z axis only
    ANY = "any"                       # Any 3D orientation (up to 6 axis-aligned permutations)


class MachineCutType(str, Enum):
    GUILLOTINE = "guillotine"
    FREE = "free"                     # Waterjet / CNC (stub in MVP)


class MachineAutomation(str, Enum):
    MANUAL = "manual"
    ROTATING = "rotating"
    CNC = "CNC"


class MachineProfile(BaseModel):
    id: str
    name: str
    cut_type: MachineCutType = MachineCutType.GUILLOTINE
    max_cut_height: float = Field(default=48.0, description="Max throat/cut clearance in inches")
    kerf: float = Field(default=0.125, description="Saw blade kerf in inches, default 1/8 in")
    automation: MachineAutomation = MachineAutomation.MANUAL
    preferred_direction: str = "X"

    @field_validator("max_cut_height", "kerf")
    @classmethod
    def validate_machine_dims(cls, v: float, info) -> float:
        return snap_to_16th(v, info.field_name)


class SkinTrimConfig(BaseModel):
    x: float = Field(default=1.0, description="Skin trim per face along X (length) in inches")
    y: float = Field(default=1.0, description="Skin trim per face along Y (width) in inches")
    z: float = Field(default=1.0, description="Skin trim per face along Z (height/rise) in inches")

    @field_validator("x", "y", "z")
    @classmethod
    def validate_trim(cls, v: float, info) -> float:
        if v < 0:
            raise ValueError(f"{info.field_name} skin trim must be >= 0")
        return snap_to_16th(v, info.field_name) if v > 0 else 0.0


class FoamGrade(BaseModel):
    code: str                         # e.g., "HR-40"
    name: str                         # e.g., "High Resilience 40 ILD"
    density_pcf: float                # lbs per cubic foot
    ild_firmness: float               # Indentation Load Deflection
    color_hex: str = "#3b82f6"        # Default visual color
    description: Optional[str] = None


class PartItem(BaseModel):
    id: str
    sku: str
    name: str
    grade: str
    length: float = Field(..., description="Length (X) in inches")
    width: float = Field(..., description="Width (Y) in inches")
    height: float = Field(..., description="Height (Z / rise) in inches")
    quantity: int = Field(default=1, ge=1)
    orientation_mode: OrientationMode = OrientationMode.RISE_LOCKED
    color_hex: Optional[str] = None

    @field_validator("length", "width", "height")
    @classmethod
    def validate_dims(cls, v: float, info) -> float:
        return snap_to_16th(v, info.field_name)

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height


class BunStock(BaseModel):
    id: str
    code: str
    grade: str
    nominal_length: float = Field(default=108.0, description="Nominal bun length in inches")
    nominal_width: float = Field(default=82.0, description="Nominal bun width in inches")
    nominal_height: float = Field(default=40.0, description="Nominal bun height in inches")
    skin_trim: SkinTrimConfig = Field(default_factory=SkinTrimConfig)
    cost: float = Field(default=0.0)

    @field_validator("nominal_length", "nominal_width", "nominal_height")
    @classmethod
    def validate_nominal_dims(cls, v: float, info) -> float:
        return snap_to_16th(v, info.field_name)

    @property
    def gross_volume(self) -> float:
        return self.nominal_length * self.nominal_width * self.nominal_height

    @property
    def usable_dims(self) -> Tuple[float, float, float]:
        """Usable dimensions after removing skin trim (2 * trim per axis)."""
        ux = self.nominal_length - 2.0 * self.skin_trim.x
        uy = self.nominal_width - 2.0 * self.skin_trim.y
        uz = self.nominal_height - 2.0 * self.skin_trim.z
        if ux <= 0 or uy <= 0 or uz <= 0:
            raise ValueError(
                f"Block usable dimension <= 0 after skin trim ({self.skin_trim}): "
                f"({ux}, {uy}, {uz}). Block rejected."
            )
        return (snap_to_16th(ux, "usable_x"), snap_to_16th(uy, "usable_y"), snap_to_16th(uz, "usable_z"))

    @property
    def usable_volume(self) -> float:
        ux, uy, uz = self.usable_dims
        return ux * uy * uz


class RemnantStock(BaseModel):
    id: str
    code: str
    grade: str
    length: float
    width: float
    height: float
    cut_date: date
    storage_location: str = "Bay R-01"
    usability_score: float = Field(default=0.75, ge=0.0, le=1.0)

    @field_validator("length", "width", "height")
    @classmethod
    def validate_remnant_dims(cls, v: float, info) -> float:
        return snap_to_16th(v, info.field_name)

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height


class PlacedPart(BaseModel):
    part_id: str
    sku: str
    name: str
    grade: str
    # Coordinates in usable block coordinate space (origin 0,0,0)
    x: float
    y: float
    z: float
    length: float
    width: float
    height: float
    orientation_used: Tuple[float, float, float]
    color_hex: str = "#3b82f6"

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height


class RemnantOutput(BaseModel):
    id: str
    code: str
    x: float
    y: float
    z: float
    length: float
    width: float
    height: float
    grade: str
    volume: float
    usability_score: float
    retained: bool = True
    storage_location: str = "Bay R-Pending"


class CutType(str, Enum):
    SKIN_TRIM = "skin_trim"
    HORIZONTAL_SLAB = "horizontal_slab"
    VERTICAL_RIP = "vertical_rip"
    CROSSCUT = "crosscut"


class CutStep(BaseModel):
    step_number: int
    stage: int                        # Stage 1: Slabs, Stage 2: Rips, Stage 3: Crosscuts
    cut_type: CutType
    axis: Literal["X", "Y", "Z"]
    position_in: float
    position_display: str             # e.g., '22"' or '12 1/8"'
    kerf_in: float
    target_piece_dims: Tuple[float, float, float]
    produces_description_en: str
    produces_description_es: str
    remnant_prompt_en: Optional[str] = None
    remnant_prompt_es: Optional[str] = None


class BlockLayout(BaseModel):
    block_index: int
    stock_id: str
    stock_type: Literal["bun", "remnant"]
    grade: str
    nominal_length: float
    nominal_width: float
    nominal_height: float
    usable_length: float
    usable_width: float
    usable_height: float
    skin_trim_loss_volume: float
    placed_parts: List[PlacedPart]
    usable_remnants: List[RemnantOutput]
    cuts: List[CutStep]
    gross_volume: float
    usable_volume: float
    parts_volume: float
    kerf_loss_volume: float
    unrecoverable_scrap_volume: float
    gross_utilization_pct: float      # parts_volume / gross_volume * 100
    net_utilization_pct: float        # parts_volume / usable_volume * 100
    material_recovery_pct: float      # (parts_volume + remnants_volume) / gross_volume * 100


class OptimizationRequest(BaseModel):
    job_id: str
    order_id: Optional[str] = None
    customer: Optional[str] = "Acme Bedding"
    grade: str
    machine_id: Optional[str] = None
    parts: List[PartItem]
    prefer_remnants_first: bool = True
    skin_trim_per_face: float = 1.0


class OptimizationResult(BaseModel):
    job_id: str
    grade: str
    solution_type: str = "heuristic solution"   # NEVER claim optimality
    timestamp: datetime
    machine: MachineProfile
    total_parts_demanded: int
    total_parts_placed: int
    unplaced_parts: List[PartItem] = []
    blocks_used_count: int
    blocks: List[BlockLayout]
    total_gross_volume: float
    total_usable_volume: float
    total_parts_volume: float
    total_kerf_volume: float
    total_remnant_volume: float
    total_unrecoverable_scrap_volume: float
    gross_utilization_pct: float
    net_utilization_pct: float
    total_cuts_count: int
    estimated_saw_time_minutes: float
