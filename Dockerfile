# Build stage
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Normalize Angular output path across builder versions
RUN if [ -d "dist/siri_upskill_ui/browser" ]; then \
        cp -r dist/siri_upskill_ui/browser /tmp/webroot; \
    elif [ -d "dist/siri_upskill_ui" ]; then \
        cp -r dist/siri_upskill_ui /tmp/webroot; \
    else \
        echo "Angular build output not found"; \
        ls -la dist; \
        exit 1; \
    fi

# Runtime stage
FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

RUN rm -rf ./*
COPY nginx.web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/webroot/ /usr/share/nginx/html/

EXPOSE 9005
CMD ["nginx", "-g", "daemon off;"]
