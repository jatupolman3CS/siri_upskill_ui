# Build stage
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Normalize Angular output path across builder versions
# สร้างโฟลเดอร์รอไว้ก่อน และใช้ /. เพื่อบังคับก๊อปปี้เฉพาะไฟล์ข้างใน ไม่เอาโฟลเดอร์มาครอบ
RUN mkdir -p /tmp/webroot && \
    if [ -d "dist/siri_upskill_ui/browser" ]; then \
        cp -R dist/siri_upskill_ui/browser/. /tmp/webroot/; \
    elif [ -d "dist/siri_upskill_ui" ]; then \
        cp -R dist/siri_upskill_ui/. /tmp/webroot/; \
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
# นำไฟล์ที่ normalize แล้วมาวาง
COPY --from=build /tmp/webroot/ ./

EXPOSE 9005
CMD ["nginx", "-g", "daemon off;"]