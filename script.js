document.addEventListener("DOMContentLoaded",()=>{
    if(window.katex) {
        katex.render("Re", document.getElementById('lbl-re'));
        katex.render("U_{in}", document.getElementById('lbl-u'));
        katex.render("C_d", document.getElementById('lbl-cd'));
        katex.render("C_l", document.getElementById('lbl-cl'));
    }
});

const $=(i)=>document.getElementById(i);

class Plotter{
    constructor(id,c){
        this.cv=$(id); this.ctx=this.cv.getContext('2d');
        this.d=new Array(100).fill(0); this.c=c;
        this.min=-0.5; this.max=1.5;
    }
    push(v){
        if(!isFinite(v) || isNaN(v)) return;
        this.d.shift();this.d.push(v);this.draw();
    }
    draw(){
        const rect=this.cv.getBoundingClientRect();
        this.cv.width=rect.width*2; this.cv.height=rect.height*2; 
        const ctx=this.ctx; const w=this.cv.width, h=this.cv.height;
        ctx.scale(2,2); const dw=w/2, dh=h/2; 
        
        let mn=Math.min(...this.d), mx=Math.max(...this.d);
        this.min=this.min*0.95+(mn-0.1)*0.05; this.max=this.max*0.95+(mx+0.1)*0.05;
        let r=this.max-this.min||1; ctx.clearRect(0,0,dw,dh);
        
        let y0=dh-((0-this.min)/r)*dh;
        if(y0>=0 && y0<=dh) {
            ctx.strokeStyle="rgba(255,255,255,0.2)"; ctx.lineWidth=1; 
            ctx.setLineDash([4,4]); ctx.beginPath();ctx.moveTo(0,y0);ctx.lineTo(dw,y0);ctx.stroke(); ctx.setLineDash([]);
        }
        
        ctx.strokeStyle=this.c; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.beginPath();
        for(let i=0;i<this.d.length;i++){
            let x=(i/(this.d.length-1))*dw;
            let y=dh-((this.d[i]-this.min)/r)*dh;
            if(i==0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
    }
}
const pCd=new Plotter('dragCanvas','#f472b6'), pCl=new Plotter('liftCanvas','#34d399');

// --- WEBGL ---
const cv=$('simCanvas');
const gl=cv.getContext('webgl2',{alpha:false,antialias:false});
if(!gl||!gl.getExtension('EXT_color_buffer_float'))alert("WebGL2 Float Texture support missing");

// --- SHADERS ---
const VS=`#version 300 es
layout(location=0)in vec2 p; out vec2 v_uv;
void main(){gl_Position=vec4(p,0,1); v_uv=p*0.5+0.5;}`;

const HEAD=`#version 300 es
precision highp float; uniform vec2 u_res;
bool isSolid(vec2 p){
    float cx=u_res.x*0.25, cy=u_res.y*0.5, R=u_res.y*0.1;
    float lf=R*4.0, lr=R*1.732, dx=p.x-cx, dy=p.y-cy;
    if(abs(dy)>R)return false;
    if(dx<0.0)return(dx>=-lf && abs(dy)<=R*(1.0+dx/lf));
    return(dx<=lr && abs(dy)<=R*(1.0-dx/lr));
}`;

const VS_VEC=`#version 300 es
layout(location=0)in vec2 ap; layout(location=1)in vec2 ip;
uniform sampler2D tv; uniform vec2 ur; out float vs;
void main(){
    vec2 uv=ip/ur; vec4 d=texture(tv,uv); vec2 v=d.zw; vs=length(v);
    float s=clamp(vs*18.0,5.0,25.0); float a=atan(v.y,v.x);
    float c=cos(a),sn=sin(a); mat2 r=mat2(c,-sn,sn,c);
    vec2 l=r*(ap*s); gl_Position=vec4((ip+l)/ur*2.0-1.0,0,1);
}`;
const FS_VEC=`#version 300 es
precision mediump float; in float vs; out vec4 c;
void main(){float a=smoothstep(0.01,0.05,vs); c=vec4(1,1,1,a*0.9);}`;

const FS_INIT=`${HEAD} layout(location=0)out vec4 o0;layout(location=1)out vec4 o1;layout(location=2)out vec4 o2;uniform float u_uin;
void main(){vec2 c=gl_FragCoord.xy;bool s=isSolid(c);float rho=1.0;
if(!s && distance(c,vec2(u_res.x*0.25-50.0,u_res.y*0.5))<10.0)rho=1.1;
float ux=s?0.0:u_uin,uy=0.0,usq=ux*ux;
float w[9];w[0]=4./9.;w[1]=1./9.;w[2]=1./9.;w[3]=1./9.;w[4]=1./9.;w[5]=1./36.;w[6]=1./36.;w[7]=1./36.;w[8]=1./36.;
vec2 d[9];d[0]=vec2(0,0);d[1]=vec2(1,0);d[2]=vec2(0,1);d[3]=vec2(-1,0);d[4]=vec2(0,-1);d[5]=vec2(1,1);d[6]=vec2(-1,1);d[7]=vec2(-1,-1);d[8]=vec2(1,-1);
float f[9];for(int i=0;i<9;i++){float cu=dot(d[i],vec2(ux,uy));f[i]=w[i]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*usq);}
o0=vec4(f[0],f[1],f[2],f[3]);o1=vec4(f[4],f[5],f[6],f[7]);o2=vec4(f[8],rho,ux,uy);}`;

const FS_SIM=`${HEAD} uniform sampler2D t0,t1,t2;uniform float u_om,u_uin;layout(location=0)out vec4 o0;layout(location=1)out vec4 o1;layout(location=2)out vec4 o2;
float gF(int i,vec2 p){
    vec2 off=vec2(0);if(i==1)off=vec2(-1,0);else if(i==2)off=vec2(0,-1);else if(i==3)off=vec2(1,0);else if(i==4)off=vec2(0,1);
    else if(i==5)off=vec2(-1,-1);else if(i==6)off=vec2(1,-1);else if(i==7)off=vec2(1,1);else if(i==8)off=vec2(-1,1);
    vec2 uv=(p+off)/u_res;
    if(uv.x<0.0)uv.x+=1.0;if(uv.x>1.0)uv.x-=1.0;if(uv.y<0.0)uv.y+=1.0;if(uv.y>1.0)uv.y-=1.0;
    if(i<4){vec4 v=texture(t0,uv);return(i==0)?v.x:(i==1)?v.y:(i==2)?v.z:v.w;}
    else if(i<8){vec4 v=texture(t1,uv);return(i==4)?v.x:(i==5)?v.y:(i==6)?v.z:v.w;}
    else return texture(t2,uv).x;
}
void main(){
    vec2 xy=gl_FragCoord.xy;bool s=isSolid(xy);
    float f[9];for(int i=0;i<9;i++)f[i]=gF(i,xy);
    float rho=0.0,ux=0.0,uy=0.0;
    vec2 c[9];c[0]=vec2(0,0);c[1]=vec2(1,0);c[2]=vec2(0,1);c[3]=vec2(-1,0);c[4]=vec2(0,-1);c[5]=vec2(1,1);c[6]=vec2(-1,1);c[7]=vec2(-1,-1);c[8]=vec2(1,-1);
    for(int i=0;i<9;i++){rho+=f[i];ux+=f[i]*c[i].x;uy+=f[i]*c[i].y;}
    if(s){ux=0.0;uy=0.0;rho=1.0;}else if(rho>0.0){ux/=rho;uy/=rho;}
    if(xy.x<2.0&&!s){ux=u_uin;uy=0.0;rho=1.0;}
    float usq=ux*ux+uy*uy;
    float w[9];w[0]=4./9.;w[1]=1./9.;w[2]=1./9.;w[3]=1./9.;w[4]=1./9.;w[5]=1./36.;w[6]=1./36.;w[7]=1./36.;w[8]=1./36.;
    float fn[9];
    for(int i=0;i<9;i++){
        float cu=dot(c[i],vec2(ux,uy)); float eq=w[i]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*usq);
        fn[i]=s?eq:(f[i]*(1.0-u_om)+eq*u_om);
    }
    if(xy.x<2.0&&!s){for(int i=0;i<9;i++){float cu=dot(c[i],vec2(ux,uy));fn[i]=w[i]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*usq);}}
    o0=vec4(fn[0],fn[1],fn[2],fn[3]);o1=vec4(fn[4],fn[5],fn[6],fn[7]);o2=vec4(fn[8],rho,ux,uy);
}`;

const FS_VIS=`${HEAD} uniform sampler2D t2;uniform int mode,theme,cmap;uniform float contrast; in vec2 v_uv; out vec4 color;
vec3 turbo(float t){vec3 a=vec3(0.5);vec3 b=vec3(0.5);vec3 c=vec3(1.0);vec3 d=vec3(0.0,0.33,0.67);return a+b*cos(6.283*(c*t+d));}
vec3 magma(float t){return vec3(t,0.2*t,0.4*t)+vec3(0.8*t*t,0.5*t*t,0.0);}
vec3 viridis(float t){return vec3(0.2+0.8*t, 0.1+0.7*t, 0.3+0.5*(1.0-t));}
vec3 plasma(float t){return vec3(t, 0.0, 0.5*t) + vec3(0.0, 0.8*t, 0.5*t);}
vec3 inferno(float t){return vec3(t*0.8, 0.0, 0.0) + vec3(0.5*t, 0.8*t, 0.0);}
vec3 jet(float t){return clamp(vec3(1.5*t, t*t, t*t*t)+vec3(0,0.1*t,0.2*t),0.0,1.0);}
void main(){
    vec2 px=1.0/u_res; vec2 uv=(floor(v_uv*u_res)+0.5)*px;
    vec4 d=texture(t2,uv); float val=0.0;
    if(mode==0){
        vec2 e=vec2(px.x,0);vec2 n=vec2(0,px.y);
        float uyE=texture(t2,uv+e).w;float uyW=texture(t2,uv-e).w;float uxN=texture(t2,uv+n).z;float uxS=texture(t2,uv-n).z;
        val=0.5+((uyE-uyW)-(uxN-uxS))*50.0*contrast;
    }else if(mode==1)val=length(d.zw)*4.0*contrast; else val=abs(d.y-1.0)*400.0*contrast;
    vec3 col; val=clamp(val,0.0,1.0);
    if(cmap==0)col=turbo(val); else if(cmap==1)col=magma(val); else if(cmap==2)col=viridis(val);
    else if(cmap==3)col=inferno(val); else if(cmap==4)col=plasma(val); else col=jet(val);
    if(isSolid(uv*u_res)) col=vec3(0.05,0.05,0.05);
    color=vec4(col,1.0);
}`;

function compile(vs,fs){const p=gl.createProgram(),v=gl.createShader(gl.VERTEX_SHADER),f=gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(v,vs);gl.compileShader(v);gl.shaderSource(f,fs);gl.compileShader(f);
gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);return p;}

const P_INIT=compile(VS,FS_INIT), P_SIM=compile(VS,FS_SIM), P_VIS=compile(VS,FS_VIS), P_VEC=compile(VS_VEC,FS_VEC);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

const arrowVerts = new Float32Array([-0.5,-0.05, 0.15,-0.05, -0.5,0.05, -0.5,0.05, 0.15,-0.05, 0.15,0.05, 0.15,-0.2, 0.5,0.0, 0.15,0.2]);
const arrowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, arrowBuf); gl.bufferData(gl.ARRAY_BUFFER, arrowVerts, gl.STATIC_DRAW);

let NX=800,NY=400, state=[], bPix=[], roiW, roiH, roiBuf, probe={x:0,y:0}, roiOff={x:0,y:0};
let P={Re:1000, u:0.1, sp:8, run:true, rst:true, con:0.8, mode:0, theme:1, vec:false, cmap:0, time:0};
let vecCount=0; const vecInstBuf=gl.createBuffer();

// VAO Setup
const vecVAO = gl.createVertexArray();
gl.bindVertexArray(vecVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, arrowBuf);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, vecInstBuf);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
gl.bindVertexArray(null);

function geom(){
    bPix=[]; const cx=NX/4,cy=NY/2,R=NY/10,lf=R*4,lr=R*1.732, chk=(x,y)=>{
        let dx=x-cx,dy=y-cy; if(Math.abs(dy)>R)return false;
        if(dx<0)return(dx>=-lf && Math.abs(dy)<=R*(1.0+dx/lf)); return(dx<=lr && Math.abs(dy)<=R*(1.0-dx/lr));
    };
    let bx=Math.floor(cx-lf-2),bX=Math.floor(cx+lr+2),by=Math.floor(cy-R-2),bY=Math.floor(cy+R+2);
    roiW=bX-bx+1; roiH=bY-by+1; roiBuf=new Float32Array(roiW*roiH*4); roiOff={x:bx,y:by};
    for(let y=by;y<=bY;y++)for(let x=bx;x<=bX;x++)if(!chk(x,y)){
        let nx=0,ny=0,e=false; if(chk(x+1,y)){nx=1;e=true;}else if(chk(x-1,y)){nx=-1;e=true;}
        if(chk(x,y+1)){ny=1;e=true;}else if(chk(x,y-1)){ny=-1;e=true;}
        if(e){let l=Math.sqrt(nx*nx+ny*ny); bPix.push({x:x,y:y,nx:nx/l,ny:ny/l});}
    }
    probe={x:NX*0.6, y:NY*0.5};
    let pts=[], stride = Math.floor(NX/50); 
    for(let y=stride/2; y<NY; y+=stride) for(let x=stride/2; x<NX; x+=stride) if(!chk(x,y)) pts.push(x,y);
    vecCount = pts.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, vecInstBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
}

function init(res){
    const s=[[400,200],[800,400],[1200,600]]; [NX,NY]=s[res];
    const mk=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,NX,NY,0,gl.RGBA,gl.FLOAT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;}
    state=[0,1].map(()=>{const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);const t=[mk(),mk(),mk()];
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t[0],0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,t[1],0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT2,gl.TEXTURE_2D,t[2],0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);return {f:f,t:t};});
    resize(); geom(); P.rst=true;
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(cv.clientWidth * dpr), h = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
window.addEventListener('resize', resize);

const ui={re:$('reSlider'),u:$('uSlider'),sp:$('speedSlider'),con:$('conSlider'),view:$('viewSelect'),res:$('resSelect'),st:$('status-badge'),mlups:$('stat-mlups'),probe:$('probe-val'),vecBtn:$('vecBtn'),cmap:$('cmapSelect')};
const upd=()=>{ 
    P.Re=+ui.re.value; $('disp-re').innerText=P.Re;
    P.u=+ui.u.value; $('disp-u').innerText=P.u.toFixed(2);
    P.sp=+ui.sp.value; $('disp-sp').innerText=P.sp;
    P.con=+ui.con.value; P.mode=+ui.view.value; P.cmap=+ui.cmap.value;
};
['re','u','sp','con','view','cmap'].forEach(k=>ui[k].oninput=upd);
ui.res.onchange=()=>init(+ui.res.value);
$('themeBtn').onclick=()=>{P.theme=1-P.theme; document.body.setAttribute('data-theme',P.theme?'light':'dark');};
const pBtn=$('playBtn'); 
pBtn.onclick=()=>{P.run=!P.run; pBtn.innerHTML=P.run?'<span class="icon">▶</span> Running':'Paused'; pBtn.classList.toggle('active');};

$('resetBtn').onclick=()=>{
    P.rst=true; ui.st.innerHTML='<span class="dot"></span> System Stable'; ui.st.className='badge-stable'; 
    P.run=true; pBtn.classList.add('active'); pBtn.innerHTML='<span class="icon">▶</span> Running';
    pCd.d.fill(0); pCl.d.fill(0);
};

ui.vecBtn.onclick = () => {
    P.vec = !P.vec;
    ui.vecBtn.classList.toggle('active', P.vec);
};

window.applyPreset = (type) => {
    if(type==='laminar') { ui.re.value=200; ui.u.value=0.05; ui.sp.value=20; ui.con.value=0.8; }
    if(type==='vortex') { ui.re.value=1400; ui.u.value=0.10; ui.sp.value=8; ui.con.value=0.8; }
    if(type==='turb') { ui.re.value=6000; ui.u.value=0.15; ui.sp.value=5; ui.con.value=1.2; }
    upd(); P.rst=true; P.time=0;
};

init(1);
let idx=0, fr=0, lt=0;
function loop(now){
    if(P.rst){
        gl.viewport(0,0,NX,NY); gl.bindFramebuffer(gl.FRAMEBUFFER,state[idx].f);
        gl.useProgram(P_INIT); gl.uniform2f(gl.getUniformLocation(P_INIT,"u_res"),NX,NY); gl.uniform1f(gl.getUniformLocation(P_INIT,"u_uin"),P.u);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.enableVertexAttribArray(0); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); P.rst=false; pCd.d.fill(0); pCl.d.fill(0);
    }
    if(P.run){
        const D=(NY/10)*2, nu=(P.u*D)/P.Re, om=1.0/(3.0*nu+0.5);
        gl.useProgram(P_SIM); gl.uniform2f(gl.getUniformLocation(P_SIM,"u_res"),NX,NY);
        gl.uniform1f(gl.getUniformLocation(P_SIM,"u_om"),om); gl.uniform1f(gl.getUniformLocation(P_SIM,"u_uin"),P.u);
        gl.uniform1i(gl.getUniformLocation(P_SIM,"t0"),0); gl.uniform1i(gl.getUniformLocation(P_SIM,"t1"),1); gl.uniform1i(gl.getUniformLocation(P_SIM,"t2"),2);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.viewport(0,0,NX,NY); 
        for(let i=0;i<P.sp;i++){
            let nxt=1-idx; gl.bindFramebuffer(gl.FRAMEBUFFER,state[nxt].f);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state[idx].t[0]);
            gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,state[idx].t[1]);
            gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,state[idx].t[2]);
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4); idx=nxt; P.time+=1.0;
        }
    }
    if(P.run && fr%5==0){
        gl.bindFramebuffer(gl.FRAMEBUFFER,state[idx].f); gl.readBuffer(gl.COLOR_ATTACHMENT2);
        gl.readPixels(roiOff.x,roiOff.y,roiW,roiH,gl.RGBA,gl.FLOAT,roiBuf);
        const pix = new Float32Array(4); gl.readPixels(probe.x,probe.y,1,1,gl.RGBA,gl.FLOAT,pix);
        ui.probe.innerText = ((pix[1]-1)*3).toFixed(3); 
        if(isNaN(pix[1])||pix[1]>5||pix[1]<0){
            P.run=false; ui.st.innerHTML='<span class="dot"></span> INSTABILITY DETECTED'; ui.st.className='crash'; 
            pBtn.classList.remove('active'); pBtn.innerText="CRASHED";
        }
        let Fx=0,Fy=0; for(let b of bPix){
            let i = ((b.y-roiOff.y)*roiW + (b.x-roiOff.x))*4; let p=(roiBuf[i+1]-1)*3; Fx+=p*b.nx; Fy+=p*b.ny;
        }
        let q=0.5*P.u*P.u*(NY/5); pCd.push(Math.abs(Fx/q)*5); pCl.push((Fy/q)*5);
        $('val-cd').innerText=pCd.d[pCd.d.length-1].toFixed(3); $('val-cl').innerText=pCl.d[pCl.d.length-1].toFixed(3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,cv.width,cv.height);
    gl.useProgram(P_VIS); gl.uniform1i(gl.getUniformLocation(P_VIS,"t2"),0);
    gl.uniform1i(gl.getUniformLocation(P_VIS,"mode"),P.mode); gl.uniform1i(gl.getUniformLocation(P_VIS,"theme"),P.theme);
    gl.uniform1i(gl.getUniformLocation(P_VIS,"cmap"),P.cmap); gl.uniform1f(gl.getUniformLocation(P_VIS,"contrast"),P.con);
    gl.uniform2f(gl.getUniformLocation(P_VIS,"u_res"),NX,NY);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state[idx].t[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.enableVertexAttribArray(0); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    if(P.vec) {
        gl.useProgram(P_VEC); gl.uniform1i(gl.getUniformLocation(P_VEC, "t_vel"), 0);
        gl.uniform2f(gl.getUniformLocation(P_VEC, "u_res"), NX, NY);
        gl.bindVertexArray(vecVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 9, vecCount);
        gl.bindVertexArray(null);
    }
    fr++;
	if(now-lt>1000){ let fps=fr; $('fps').innerText=fps+" FPS"; let mlups=(NX*NY*P.sp*fps)/1e6; ui.mlups.innerText=mlups.toFixed(1)+" MLUPS"; fr=0; lt=now; }
	requestAnimationFrame(loop);
}
$('loading').style.display='none'; requestAnimationFrame(loop);
