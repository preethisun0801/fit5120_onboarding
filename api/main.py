from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import sensors, refuges, noise, pedestrian

app = FastAPI(title="TA17 Sensory Navigation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(sensors.router, prefix="/sensors", tags=["sensors"])
app.include_router(refuges.router, prefix="/refuges", tags=["refuges"])
app.include_router(noise.router, prefix="/noise", tags=["noise"])
app.include_router(pedestrian.router, prefix="/pedestrian", tags=["pedestrian"])

@app.get("/health")
def health():
    return {"status": "ok"}