# AntiochiaArchive Backend Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Copy backend source files
COPY . .

# Expose port
EXPOSE 5000

# Start Express server
CMD ["npm", "start"]
