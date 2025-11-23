// Lattice Boltzmann Method CFD Simulator
class LBMSimulator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        
        // LBM parameters
        this.nx = 200; // Grid points in x
        this.ny = 100; // Grid points in y
        this.viscosity = 0.02;
        this.u0 = 0.1; // Initial flow velocity
        
        // D2Q9 lattice velocities
        this.ex = [0, 1, 0, -1, 0, 1, -1, -1, 1];
        this.ey = [0, 0, 1, 0, -1, 1, 1, -1, -1];
        this.w = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36];
        
        // Initialize fields
        this.f = [];
        this.fEq = [];
        this.rho = [];
        this.ux = [];
        this.uy = [];
        
        this.running = false;
        this.init();
    }
    
    init() {
        // Initialize distribution functions and macroscopic fields
        for (let i = 0; i < this.nx; i++) {
            this.f[i] = [];
            this.fEq[i] = [];
            this.rho[i] = [];
            this.ux[i] = [];
            this.uy[i] = [];
            
            for (let j = 0; j < this.ny; j++) {
                this.f[i][j] = [];
                this.fEq[i][j] = [];
                this.rho[i][j] = 1.0;
                this.ux[i][j] = this.u0;
                this.uy[i][j] = 0.0;
                
                for (let k = 0; k < 9; k++) {
                    this.f[i][j][k] = this.w[k];
                    this.fEq[i][j][k] = this.w[k];
                }
            }
        }
        
        // Add a circular obstacle in the middle
        this.obstacle = [];
        for (let i = 0; i < this.nx; i++) {
            this.obstacle[i] = [];
            for (let j = 0; j < this.ny; j++) {
                const dx = i - this.nx / 4;
                const dy = j - this.ny / 2;
                const r = Math.sqrt(dx * dx + dy * dy);
                this.obstacle[i][j] = r < this.ny / 8;
            }
        }
    }
    
    computeEquilibrium() {
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                const usqr = this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j];
                
                for (let k = 0; k < 9; k++) {
                    const eu = this.ex[k] * this.ux[i][j] + this.ey[k] * this.uy[i][j];
                    this.fEq[i][j][k] = this.rho[i][j] * this.w[k] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usqr);
                }
            }
        }
    }
    
    collide() {
        const omega = 1 / (3 * this.viscosity + 0.5);
        
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                if (!this.obstacle[i][j]) {
                    for (let k = 0; k < 9; k++) {
                        this.f[i][j][k] += omega * (this.fEq[i][j][k] - this.f[i][j][k]);
                    }
                }
            }
        }
    }
    
    stream() {
        const fNew = [];
        for (let i = 0; i < this.nx; i++) {
            fNew[i] = [];
            for (let j = 0; j < this.ny; j++) {
                fNew[i][j] = [];
                for (let k = 0; k < 9; k++) {
                    fNew[i][j][k] = 0;
                }
            }
        }
        
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                for (let k = 0; k < 9; k++) {
                    const iNext = (i + this.ex[k] + this.nx) % this.nx;
                    const jNext = (j + this.ey[k] + this.ny) % this.ny;
                    fNew[iNext][jNext][k] = this.f[i][j][k];
                }
            }
        }
        
        this.f = fNew;
    }
    
    boundaryConditions() {
        // Left boundary - constant velocity
        for (let j = 0; j < this.ny; j++) {
            this.ux[0][j] = this.u0;
            this.uy[0][j] = 0;
            this.rho[0][j] = 1.0;
        }
        
        // Bounce-back on obstacle
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                if (this.obstacle[i][j]) {
                    const temp = [...this.f[i][j]];
                    this.f[i][j][1] = temp[3];
                    this.f[i][j][2] = temp[4];
                    this.f[i][j][3] = temp[1];
                    this.f[i][j][4] = temp[2];
                    this.f[i][j][5] = temp[7];
                    this.f[i][j][6] = temp[8];
                    this.f[i][j][7] = temp[5];
                    this.f[i][j][8] = temp[6];
                }
            }
        }
    }
    
    computeMacroscopic() {
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                let rho = 0;
                let ux = 0;
                let uy = 0;
                
                for (let k = 0; k < 9; k++) {
                    rho += this.f[i][j][k];
                    ux += this.ex[k] * this.f[i][j][k];
                    uy += this.ey[k] * this.f[i][j][k];
                }
                
                this.rho[i][j] = rho;
                this.ux[i][j] = ux / rho;
                this.uy[i][j] = uy / rho;
            }
        }
    }
    
    step() {
        this.computeMacroscopic();
        this.computeEquilibrium();
        this.collide();
        this.stream();
        this.boundaryConditions();
    }
    
    render() {
        const imageData = this.ctx.createImageData(this.width, this.height);
        const data = imageData.data;
        
        const scaleX = this.width / this.nx;
        const scaleY = this.height / this.ny;
        
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                const speed = Math.sqrt(this.ux[i][j] * this.ux[i][j] + this.uy[i][j] * this.uy[i][j]);
                
                // Color based on velocity magnitude
                const hue = Math.min(240, Math.max(0, 240 - speed * 2000));
                const rgb = this.hslToRgb(hue / 360, 1, 0.5);
                
                for (let px = 0; px < scaleX; px++) {
                    for (let py = 0; py < scaleY; py++) {
                        const x = Math.floor(i * scaleX + px);
                        const y = Math.floor(j * scaleY + py);
                        const idx = (y * this.width + x) * 4;
                        
                        if (this.obstacle[i][j]) {
                            data[idx] = 255;
                            data[idx + 1] = 255;
                            data[idx + 2] = 255;
                        } else {
                            data[idx] = rgb[0];
                            data[idx + 1] = rgb[1];
                            data[idx + 2] = rgb[2];
                        }
                        data[idx + 3] = 255;
                    }
                }
            }
        }
        
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    hslToRgb(h, s, l) {
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
}

// Application setup
let simulator;
let animationId;

function init() {
    const canvas = document.getElementById('cfdCanvas');
    simulator = new LBMSimulator(canvas);
    
    // Setup controls
    const viscositySlider = document.getElementById('viscosity');
    const viscosityValue = document.getElementById('viscosityValue');
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speedValue');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    viscositySlider.addEventListener('input', (e) => {
        simulator.viscosity = parseFloat(e.target.value);
        viscosityValue.textContent = e.target.value;
    });
    
    speedSlider.addEventListener('input', (e) => {
        simulator.u0 = parseFloat(e.target.value);
        speedValue.textContent = e.target.value;
    });
    
    startBtn.addEventListener('click', () => {
        simulator.running = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        animate();
    });
    
    stopBtn.addEventListener('click', () => {
        simulator.running = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    });
    
    resetBtn.addEventListener('click', () => {
        simulator.init();
        simulator.render();
    });
    
    stopBtn.disabled = true;
    
    // Initial render
    simulator.render();
}

function animate() {
    if (simulator.running) {
        simulator.step();
        simulator.render();
        animationId = requestAnimationFrame(animate);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
