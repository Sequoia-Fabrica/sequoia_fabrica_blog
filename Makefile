.PHONY: serve build

serve:
	go run -tags extended github.com/gohugoio/hugo@latest serve --watch

build:
	go run -tags extended github.com/gohugoio/hugo@latest build
