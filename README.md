# System Trader

System Trader is a browser-based dashboard that runs locally as a static web application.

## Requirements

- Python 3.x
- A modern browser such as Chrome, Edge, or Brave

## Quick Start

Open a terminal in the project folder and run:

```powershell
cd path\to\SystemTrader
python -m http.server 8022
```

Then open:

```text
http://localhost:8022
```

## Run On Any Port

You can use any available local port you prefer:

```powershell
python -m http.server <port>
```

Examples:

```powershell
python -m http.server 3000
python -m http.server 5500
python -m http.server 8022
python -m http.server 8080
```

Open the app in your browser using the same port:

```text
http://localhost:<port>
```

## Recommended Local Workflow

1. Download or clone the project
2. Open `PowerShell` or `Command Prompt`
3. Change into the project directory
4. Start the local server with any free port
5. Open `http://localhost:<port>` in your browser

## Important Notes

- Run the app through a local server rather than opening `index.html` directly
- If a port is already in use, choose a different one
- Stop the local server any time with `Ctrl + C`

## Project Structure

- `index.html`: main application shell
- `style.css`: application styling
- `app.js`: bootstraps the application
- `pages/`: page-level UI modules
- `docs/`: archived notes and handover documents

## Troubleshooting

If the browser does not load the app:

- confirm Python is installed by running `python --version`
- confirm you started the server inside the correct project folder
- confirm you opened the same port in the browser that you used in the server command
- try a different port if the current one is unavailable
