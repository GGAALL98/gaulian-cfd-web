# gaulian-cfd-web
A real-time LBM solver

## Description
Gaulian CFD is a real-time Computational Fluid Dynamics (CFD) simulator using the Lattice Boltzmann Method (LBM). This web-based application visualizes fluid flow patterns and demonstrates fundamental fluid dynamics principles.

## Features
- Real-time fluid simulation using the D2Q9 Lattice Boltzmann Method
- Interactive viscosity control
- Adjustable flow speed
- Visual representation of velocity field with color-coded visualization
- Circular obstacle demonstrating flow around objects

## Usage

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/GGAALL98/gaulian-cfd-web.git
   cd gaulian-cfd-web
   ```

2. Open `index.html` directly in a web browser, or serve it using a local web server:
   
   Using Python:
   ```bash
   python -m http.server 8000
   ```
   Or:
   ```bash
   python3 -m http.server 8000
   ```

   Then open your browser to `http://localhost:8000`

### Using the Simulator
1. Click the "Start Simulation" button to begin the fluid simulation
2. Adjust the viscosity slider to change the fluid's resistance to flow
3. Adjust the flow speed slider to change the initial velocity of the fluid
4. Click "Stop" to pause the simulation
5. Click "Reset" to restart with initial conditions

## Technical Details
The simulator implements the D2Q9 Lattice Boltzmann Method, which uses a 9-velocity discrete particle distribution on a 2D square lattice. The method solves the Navier-Stokes equations for incompressible fluid flow.

## License
MIT
