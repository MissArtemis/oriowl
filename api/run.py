import uvicorn

from owltrace.config import read_config

if __name__ == "__main__":
    uvicorn.run("owltrace.main:app", host="0.0.0.0", port=read_config().port, access_log=False)
