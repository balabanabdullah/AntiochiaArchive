# AntiochiaArchive Backend Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy backend source files
COPY . .

# Explicit, load-bearing copy of the reviewed, drift-checked v2 dataset
# bundled for production (see backend/test/v2/dataBundleDrift.test.js and
# V2-ARCHITECTURE.md "Legacy replacement layer" / "Cultural entity
# publication review"). Cloud Run's `gcloud run deploy
# antiochia-archive-backend --source backend` sends only this backend/
# directory as the build context — the repository-root data/ directory is
# physically outside it and unreachable by any COPY instruction. This line
# is what makes V2_DATA_STORE=local + the V2_*_JSON_PATH env vars
# (see docker-compose.yml / V1-RELEASE.md) resolve to real, present files
# inside the image instead of crash-looping at startup. Do not rely on the
# blanket `COPY . .` above alone — this line stays even if that copy step
# changes.
COPY data/ ./data/

# Expose port
EXPOSE 5000

# Start Express server
CMD ["npm", "start"]
