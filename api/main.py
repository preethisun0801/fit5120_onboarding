import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import sensors, refuges, noise, pedestrian

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ta17-api")

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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "path": str(request.url.path)},
        headers={"Access-Control-Allow-Origin": "http://localhost:5173"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}