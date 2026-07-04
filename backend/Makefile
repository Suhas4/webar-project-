.PHONY: run build build-linux test clean smoke

APP_NAME := webar-backend

## run — start the server locally (uses .env if present)
run:
	go run main.go

## build — compile for the current OS/arch
build:
	go build -o $(APP_NAME) .

## build-linux — cross-compile for Render's Linux runtime
build-linux:
	GOOS=linux GOARCH=amd64 go build -o $(APP_NAME)-linux .

## test — run all Go tests
test:
	go test ./...

## clean — remove compiled binaries
clean:
	rm -f $(APP_NAME) $(APP_NAME)-linux

## smoke — quick health check (requires server running on :8080)
smoke:
	@curl -sf http://localhost:8080/health | python3 -m json.tool || \
		(echo "❌ Health check failed — is the server running?" && exit 1)
	@echo "✅ Health check passed"
