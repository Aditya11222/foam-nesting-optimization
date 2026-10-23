"""
FastAPI application entrypoint for Foam Nesting & Cutting Optimization.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes_grades import router as grades_router
from .api.routes_machines import router as machines_router
from .api.routes_inventory import router as inventory_router
from .api.routes_optimize import router as optimize_router

app = FastAPI(
    title="Foam Nesting & Cutting Optimization API",
    description="Tatras Data 3D Polyurethane Foam Block Nesting & Guillotine Saw Optimization Engine",
    version="1.0.0",
)

# Enable CORS for local Vite frontend (typically localhost:5173 or localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(grades_router)
app.include_router(machines_router)
app.include_router(inventory_router)
app.include_router(optimize_router)


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "foam-nesting-optimization-backend",
        "version": "1.0.0",
        "units": "inches (snapped to 1/16\")",
        "optimization": "3D Guillotine Slicing Tree (Heuristic Solution)"
    }


# Serve built React frontend if dist exists
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_possible_dirs = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(__file__).resolve().parent.parent / "frontend" / "dist",
    Path("frontend/dist").resolve(),
    Path("/vercel/path0/frontend/dist"),
]

frontend_dist = None
for d in _possible_dirs:
    if d.exists() and (d / "index.html").exists():
        frontend_dist = d
        break

if frontend_dist:
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API route not found")
        target_file = frontend_dist / full_path
        if target_file.exists() and target_file.is_file():
            return FileResponse(target_file)
        return FileResponse(frontend_dist / "index.html")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
