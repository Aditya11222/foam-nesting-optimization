"""
3D Guillotine Slicing Tree (k-d tree structure).
Represents recursive orthogonal subdivisions of a foam block.
Guarantees by construction that all placed parts can be cut via through-edge guillotine saw passes.
"""

from typing import Optional, List, Tuple
from ..domain.models import PlacedPart, RemnantOutput
from ..domain.units import snap_to_16th


class SlicingNode:
    def __init__(
        self,
        x: float,
        y: float,
        z: float,
        dx: float,
        dy: float,
        dz: float,
        parent: Optional["SlicingNode"] = None,
        node_id: Optional[str] = None
    ):
        self.x = snap_to_16th(x, "node_x") if x > 0 else 0.0
        self.y = snap_to_16th(y, "node_y") if y > 0 else 0.0
        self.z = snap_to_16th(z, "node_z") if z > 0 else 0.0
        self.dx = snap_to_16th(dx, "node_dx")
        self.dy = snap_to_16th(dy, "node_dy")
        self.dz = snap_to_16th(dz, "node_dz")
        self.parent = parent
        self.node_id = node_id or f"box_{int(x)}_{int(y)}_{int(z)}"

        # Leaf state
        self.is_leaf = True
        self.placed_part: Optional[PlacedPart] = None
        self.is_remnant: bool = False
        self.remnant_info: Optional[RemnantOutput] = None

        # Internal cut node state (if split)
        self.cut_axis: Optional[str] = None       # "X", "Y", or "Z"
        self.cut_coord: Optional[float] = None    # Absolute coordinate along cut_axis
        self.kerf: float = 0.0
        self.left_child: Optional["SlicingNode"] = None   # [min, cut_coord]
        self.right_child: Optional["SlicingNode"] = None  # [cut_coord + kerf, max]

    @property
    def volume(self) -> float:
        return self.dx * self.dy * self.dz

    def can_fit(self, px: float, py: float, pz: float) -> bool:
        """Check if part of dimensions (px, py, pz) fits in this free space."""
        if not self.is_leaf or self.placed_part is not None:
            return False
        return (px <= self.dx + 1e-5) and (py <= self.dy + 1e-5) and (pz <= self.dz + 1e-5)

    def split(self, axis: str, cut_pos: float, kerf: float) -> Tuple["SlicingNode", "SlicingNode"]:
        """
        Split this leaf node into two children via a guillotine cut plane perpendicular to `axis`.
        `cut_pos` is the thickness of the first piece along `axis`.
        `kerf` is the material consumed by the saw cut.
        """
        if not self.is_leaf:
            raise ValueError("Cannot split an already split node.")
        
        cut_pos = snap_to_16th(cut_pos, f"cut_pos_{axis}")
        kerf = snap_to_16th(kerf, "kerf") if kerf > 0 else 0.0

        if axis == "X":
            if cut_pos + kerf >= self.dx:
                raise ValueError(f"Cut position {cut_pos} + kerf {kerf} >= box length {self.dx}")
            rem_dx = snap_to_16th(self.dx - cut_pos - kerf, "rem_dx")
            left = SlicingNode(self.x, self.y, self.z, cut_pos, self.dy, self.dz, parent=self)
            right = SlicingNode(self.x + cut_pos + kerf, self.y, self.z, rem_dx, self.dy, self.dz, parent=self)
            abs_coord = self.x + cut_pos

        elif axis == "Y":
            if cut_pos + kerf >= self.dy:
                raise ValueError(f"Cut position {cut_pos} + kerf {kerf} >= box width {self.dy}")
            rem_dy = snap_to_16th(self.dy - cut_pos - kerf, "rem_dy")
            left = SlicingNode(self.x, self.y, self.z, self.dx, cut_pos, self.dz, parent=self)
            right = SlicingNode(self.x, self.y + cut_pos + kerf, self.z, self.dx, rem_dy, self.dz, parent=self)
            abs_coord = self.y + cut_pos

        elif axis == "Z":
            if cut_pos + kerf >= self.dz:
                raise ValueError(f"Cut position {cut_pos} + kerf {kerf} >= box height {self.dz}")
            rem_dz = snap_to_16th(self.dz - cut_pos - kerf, "rem_dz")
            left = SlicingNode(self.x, self.y, self.z, self.dx, self.dy, cut_pos, parent=self)
            right = SlicingNode(self.x, self.y, self.z + cut_pos + kerf, self.dx, self.dy, rem_dz, parent=self)
            abs_coord = self.z + cut_pos

        else:
            raise ValueError(f"Invalid cut axis: {axis}")

        self.is_leaf = False
        self.cut_axis = axis
        self.cut_coord = abs_coord
        self.kerf = kerf
        self.left_child = left
        self.right_child = right
        return left, right

    def get_free_leaves(self) -> List["SlicingNode"]:
        """Recursively collect all unassigned leaf nodes."""
        if self.is_leaf:
            if self.placed_part is None and not self.is_remnant:
                return [self]
            return []
        leaves = []
        if self.left_child:
            leaves.extend(self.left_child.get_free_leaves())
        if self.right_child:
            leaves.extend(self.right_child.get_free_leaves())
        return leaves

    def get_all_leaves(self) -> List["SlicingNode"]:
        """Recursively collect all leaf nodes (placed parts, remnants, scrap)."""
        if self.is_leaf:
            return [self]
        leaves = []
        if self.left_child:
            leaves.extend(self.left_child.get_all_leaves())
        if self.right_child:
            leaves.extend(self.right_child.get_all_leaves())
        return leaves
