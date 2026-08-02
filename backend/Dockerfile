# ---- build stage --------------------------------------------------------
FROM golang:1.25-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o webar-backend .

# ---- runtime stage --------------------------------------------------------
# ImageMagick converts PSD composite images to JPG thumbnails; LibreOffice
# (draw component only, to keep the image smaller) converts CDR files to PNG
# for the same purpose — neither format has a pure-Go decoder available.
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive TZ=UTC
RUN apt-get update && apt-get install -y --no-install-recommends \
        imagemagick \
        libreoffice-draw \
        libreoffice-core \
        fonts-dejavu-core \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/webar-backend .
EXPOSE 8080
CMD ["./webar-backend"]
