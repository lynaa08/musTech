FROM node:18-alpine

# Install build dependencies required for native modules like better-sqlite3
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install application dependencies, including production dependencies
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Ensure the uploads directory exists
RUN mkdir -p uploads

# Expose the port the app runs on
EXPOSE 3001

# Set environment variables
ENV PORT=3001
ENV NODE_ENV=production

# Command to run the application
CMD ["npm", "start"]
