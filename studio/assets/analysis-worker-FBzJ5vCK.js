const e={thr:.25,minArea:.004,covLo:.6,covHi:.75,weightLo:.5,weightHi:.8,core:.85,coreDev:.08,trimLo:.2,trimHi:.4,erode:2,holeMax:.3,matchIoU:.2,containK:.75,stabLo:.4,stabHi:.6,confTau:.3,confLo:.4,confHi:.7,tauUp:1,tauDown:.5,leadMaxS:.4,leadMaxCells:12,dilate:2,tapReach:3,bindAhead:.3};function t(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function n(n,i,a,o,s,c,l){let u=a*o,d=new Int32Array(u).fill(-1),f=new Int32Array(u),p=[];for(let r=0;r<u;r++){if(d[r]>=0||n[r]<e.thr)continue;let s=p.length,c=0,m=0,h=0,g=0,_=0,v=0,y=0;for(f[c++]=r,d[r]=s;c>0;){let r=f[--c],u=r%a,p=(r-u)/a;m++,h+=u,g+=p,n[r]>_&&(_=n[r]),l&&l[r]>y&&(y=l[r]),v+=n[r]>=e.core?t(0,e.coreDev,i[r]):t(e.trimLo,e.trimHi,i[r]);for(let t=-1;t<=1;t++)for(let r=-1;r<=1;r++){let i=u+r,l=p+t;if((r|t)===0||i<0||l<0||i>=a||l>=o)continue;let m=l*a+i;d[m]<0&&n[m]>=e.thr&&(d[m]=s,f[c++]=m)}}p.push({area:m/u,sx:h,sy:g,weight:_*(1-y),cov:v/m,px:m})}let m=p.map((e,t)=>t).filter(t=>p[t].area>=e.minArea).sort((e,t)=>p[t].area-p[e].area).slice(0,255),h=new Int32Array(p.length).fill(0),g=[];for(let e of m){let t=p[e];g.push({cx:(t.sx/t.px+.5)*s/a-.5,cy:(t.sy/t.px+.5)*c/o-.5,area:t.area,weight:t.weight,coverage:t.cov}),h[e]=g.length}let _=new Uint8Array(s*c);for(let e=0;e<c;e++){let t=Math.min(o-1,Math.floor((e+.5)*o/c));for(let n=0;n<s;n++){let r=Math.min(a-1,Math.floor((n+.5)*a/s)),i=d[t*a+r];_[e*s+n]=i>=0?h[i]:0}}return r(_,s,c,g.length),{width:s,height:c,labels:_,list:g}}function r(t,n,r,i){let a=n*r,o=new Uint8Array(a),s=new Int32Array(a);for(let c=1;c<=i;c++){let i=0;for(let e=0;e<a;e++)t[e]===c&&i++;if(!i)continue;o.fill(0);let l=0;for(let e=0;e<n;e++)for(let i of[0,r-1]){let r=i*n+e;t[r]!==c&&!o[r]&&(o[r]=1,s[l++]=r)}for(let e=0;e<r;e++)for(let r of[0,n-1]){let i=e*n+r;t[i]!==c&&!o[i]&&(o[i]=1,s[l++]=i)}for(;l>0;){let e=s[--l],r=e%n;for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}for(let r=0;r<a;r++){if(o[r]||t[r]===c)continue;let u=[],d=!0;for(o[r]=1,s[l++]=r;l>0;){let e=s[--l],r=e%n;u.push(e),t[e]!==0&&(d=!1);for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}if(d&&u.length<=e.holeMax*i)for(let e of u)t[e]=c}}}function i(n){return t(e.weightLo,e.weightHi,n.weight)*t(e.covLo,e.covHi,n.coverage)}function a(e,t,n,r){if(r<=0)return e;let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0;for(let i=-r;i<=r;i++){let r=n+i;r>=0&&r<t&&(o=Math.max(o,e[a*t+r]))}i[a*t+n]=o}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0;for(let a=-r;a<=r;a++){let r=e+a;r>=0&&r<n&&(s=Math.max(s,i[r*t+o]))}a[e*t+o]=s}return a}function o(t,n,r){let i=a(t,n,r,e.dilate),o=e.erode,s=new Uint8Array(n*r);for(let e=0;e<r;e++){let r=0;for(let i=-o;i<n;i++){let a=+(i+o<n&&t[e*n+i+o]<=0),c=+(i-o-1>=0&&t[e*n+i-o-1]<=0);r+=a-c,i>=0&&(s[e*n+i]=+(t[e*n+i]>0&&r===0))}}let c=new Float32Array(n*r*4);for(let e=0;e<n;e++){let t=0;for(let a=-o;a<r;a++){let l=+(a+o<r&&!s[(a+o)*n+e]),u=+(a-o-1>=0&&!s[(a-o-1)*n+e]);if(t+=l-u,a>=0){let r=a*n+e;c[r*4]=i[r],c[r*4+1]=+(t===0)}}}return{width:n,height:r,data:c}}function s(e){let t=new Float32Array(e.width*e.height),n=e.list.map(i);for(let r=0;r<t.length;r++)e.labels[r]&&(t[r]=n[e.labels[r]-1]);return o(t,e.width,e.height)}const c={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3};function l(e,t,n){for(let n=0;n<6;n++){let r=n;for(let t=n+1;t<6;t++)Math.abs(e[t*6+n])>Math.abs(e[r*6+n])&&(r=t);if(Math.abs(e[r*6+n])<1e-12)return!1;if(r!==n){for(let t=0;t<6;t++){let i=e[n*6+t];e[n*6+t]=e[r*6+t],e[r*6+t]=i}let i=t[n];t[n]=t[r],t[r]=i}for(let r=n+1;r<6;r++){let i=e[r*6+n]/e[n*6+n];if(i!==0){for(let t=n;t<6;t++)e[r*6+t]-=i*e[n*6+t];t[r]-=i*t[n]}}}for(let r=5;r>=0;r--){let i=t[r];for(let t=r+1;t<6;t++)i-=e[r*6+t]*n[t];n[r]=i/e[r*6+r]}return!0}function u(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const d=c.abWeight*c.abWeight,f=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n,p=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n;function m(e,t,n,r,i,a,o,s,f){let m=i*a;o.fill(0,0,m),s?.fill(0),f?.fill(1,0,m);let g=c.step,_=Math.ceil(i/g),v=Math.ceil(a/g),y=_*v,b=new Float32Array(y),x=new Float32Array(y),S=new Float32Array(y),C=new Float32Array(y),w=new Float32Array(y),ee=new Float32Array(y),T=0;for(let o=0,s=0;o<v;o++)for(let c=0;c<_;c++,s++){let l=Math.min(i-1,c*g),u=Math.min(a-1,o*g),d=u*i+l;b[s]=(l+.5)/i-.5,x[s]=(u+.5)/a-.5,S[s]=e[d],C[s]=t[d],w[s]=n[d],ee[s]=r[d],T+=ee[s]}if(T<y*.3)return 0;let E=new Float32Array(y).fill(1),D=new Float32Array(y),O=new Float64Array(36),te=new Float64Array(36),ne=new Float64Array(6),re=new Float64Array(6),ie=new Float64Array(6),k=new Float64Array(6),ae=new Float64Array(6),A=new Float64Array(6),oe=new Float64Array(6),se=new Float64Array(6),j=new Uint32Array(256),ce=.05;for(let e=0;e<c.iterations;e++){O.fill(0),ne.fill(0),re.fill(0),ie.fill(0);for(let e=0;e<y;e++){let t=ee[e]*E[e];if(t<=1e-6)continue;let n=b[e],r=x[e];se[0]=1,se[1]=n,se[2]=r,se[3]=n*n,se[4]=n*r,se[5]=r*r;for(let n=0;n<6;n++){let r=se[n]*t;for(let e=n;e<6;e++)O[n*6+e]+=r*se[e];ne[n]+=r*S[e],re[n]+=r*C[e],ie[n]+=r*w[e]}}for(let e=0;e<6;e++)for(let t=0;t<e;t++)O[e*6+t]=O[t*6+e];if(te.set(O),k.set(ne),!l(te,k,ae)||(te.set(O),k.set(re),!l(te,k,A))||(te.set(O),k.set(ie),!l(te,k,oe)))return 0;j.fill(0);let e=0;for(let t=0;t<y;t++){let n=b[t],r=x[t],i=S[t]-p(ae,n,r),a=C[t]-p(A,n,r),o=w[t]-p(oe,n,r),s=Math.sqrt(i*i+d*(a*a+o*o));D[t]=s,ee[t]>.5&&(j[Math.min(255,s*1e3|0)]++,e++)}if(e<50)return 0;let t=0,n=0;for(;n<256&&(t+=j[n],!(t*2>=e));n++);ce=Math.max(.004,1.4826*(n+.5)/1e3);for(let e=0;e<y;e++){let t=D[e]/(2.5*ce);E[e]=1/(1+t*t)}}let le=Math.min(c.devLo,c.inlierK*ce),ue=0;for(let e=0;e<y;e++)D[e]<le&&ue++;let de=u(c.inlierLo,c.inlierHi,ue/y)*(1-u(c.rmsLo,c.rmsHi,ce));if(de<=0)return 0;if(s)for(let e=0;e<6;e++)s[e]=ae[e],s[6+e]=A[e],s[12+e]=oe[e];for(let r=0;r<a;r++){let s=(r+.5)/a-.5;for(let a=0;a<i;a++){let l=(a+.5)/i-.5,m=r*i+a,h=e[m]-p(ae,l,s),g=h>0?h:h*c.darkWeight,_=t[m]-p(A,l,s),v=n[m]-p(oe,l,s),y=d*(_*_+v*v);if(o[m]=Math.sqrt(g*g+y),f){let e=h>0?h:h*c.vetoDark;f[m]=u(c.vetoLo,c.vetoHi,Math.sqrt(e*e+y))}}}let fe=new Float32Array(m),pe=new Float32Array(m);for(let e=1;e<a-1;e++)for(let t=1;t<i-1;t++){let n=e*i+t,r=o[n+1]-o[n-1],a=o[n+i]-o[n-i];fe[n]=.5*Math.sqrt(r*r+a*a)}h(fe,pe,i,a,c.edgeRadius);let me=new Int32Array(m).fill(-1),he=new Int32Array(m);for(let e=0;e<m;e++){if(me[e]>=0||o[e]<c.devLo)continue;let t=0,n=0;for(he[t++]=e,me[e]=e;t>0;){let r=he[--t];pe[r]>n&&(n=pe[r]);let a=r%i;a>0&&me[r-1]<0&&o[r-1]>=c.devLo&&(me[r-1]=e,he[t++]=r-1),a<i-1&&me[r+1]<0&&o[r+1]>=c.devLo&&(me[r+1]=e,he[t++]=r+1),r>=i&&me[r-i]<0&&o[r-i]>=c.devLo&&(me[r-i]=e,he[t++]=r-i),r<m-i&&me[r+i]<0&&o[r+i]>=c.devLo&&(me[r+i]=e,he[t++]=r+i)}fe[e]=n}for(let e=0;e<m;e++){let t=me[e]>=0?Math.max(pe[e],fe[me[e]]):pe[e];o[e]=de*u(c.devLo,c.devHi,o[e])*u(c.edgeLo,c.edgeHi,t)}return de}function h(e,t,n,r,i){let a=new Float32Array(n*r),o=(e,t,n,r,a,o)=>{let s=2*i+1,c=new Float32Array(n+s),l=new Float32Array(n+s);for(let u=0;u<r;u++){let r=u*a,d=t=>{let a=t-i;return a<0||a>=n?0:e[r+a*o]},f=n+2*i;for(let e=0;e<f;e++)c[e]=e%s===0?d(e):Math.max(c[e-1],d(e));for(let e=f-1;e>=0;e--)l[e]=e===f-1||(e+1)%s===0?d(e):Math.max(l[e+1],d(e));for(let e=0;e<n;e++)t[r+e*o]=Math.max(l[e],c[e+2*i])}};o(e,a,n,r,n,1),o(a,t,r,n,1,n)}function g(e,t,n,r,i,a,o=c.vetoLo,s=c.vetoHi){return u(o,s,_(e,t,n,r,i,a))}function _(e,t,n,r,i,a){let o=r-.5,s=i-.5,l=e=>a[e]+a[e+1]*o+a[e+2]*s+a[e+3]*o*o+a[e+4]*o*s+a[e+5]*s*s,u=e-l(0),f=u>0?u:u*c.vetoDark,p=t-l(6),m=n-l(12);return Math.sqrt(f*f+d*(p*p+m*m))}const v={minPx:10,maxArea:.5,splitPx:60};function y(e,t,n,r,i,a,o,s){let c=0,l=0,u=0,d=n,f=0,p=r,m=0;for(let r=0;r<t;r++){let t=e[r],a=t%n,o=(t-a)/n;c+=a,l+=o,u+=i[t],a<d&&(d=a),a>f&&(f=a),o<p&&(p=o),o>m&&(m=o)}let h=c/t,g=l/t,_=f-d>=m-p,y=i=>{let a=0,o=0,s=0;for(let r=0;r<t;r++){let t=e[r],c=t%n,l=(t-c)/n;i&&Math.sign(_?c-h:l-g)!==i||(a+=c,o+=l,s++)}if(!s)return null;a/=s,o/=s;let c=0,l=0,u=1/0;for(let r=0;r<t;r++){let t=e[r],s=t%n,d=(t-s)/n;if(i&&Math.sign(_?s-h:d-g)!==i)continue;let f=(s-a)**2+(d-o)**2;f<u&&(u=f,c=s,l=d)}return[(c+.5)/n,(l+.5)/r]},b=y(0),x=[b];if(t>=v.splitPx)for(let e of[-1,1]){let t=y(e);t&&x.push(t)}return{u:b[0],v:b[1],pts:x,x0:d/n,y0:p/r,x1:(f+1)/n,y1:(m+1)/r,area:t/(n*r),dev:u/t,accept:a,seeded:o,bubble:s}}function b(e,t,n,r,i,a,o,s,l,d,p,m,g,_){let b=r*i;if(a.fill(0,0,b),n<=0)return 0;let C=new Uint8Array(b);for(let e of d??[]){let t=Math.round(e.u*r-.5),n=Math.round(e.v*i-.5),a=c.seedR;for(let e=Math.max(0,n-a);e<=Math.min(i-1,n+a);e++)for(let n=Math.max(0,t-a);n<=Math.min(r-1,t+a);n++)C[e*r+n]=1}let w=null;if(l){let e=new Float32Array(b);for(let t=0;t<b;t++)e[t]=+(l[t]<.5);w=new Float32Array(b),h(e,w,r,i,c.farMargin)}let ee=0,T=new Int32Array(b).fill(-1),E=new Int32Array(b),D=new Int32Array(b),O=new Uint8Array(b),te=c.seedFrac*n,ne=e=>{let n=e%r,i=(n<r-1?t[e+1]:t[e])-(n>0?t[e-1]:t[e]),a=(e<b-r?t[e+r]:t[e])-(e>=r?t[e-r]:t[e]);return .5*Math.sqrt(i*i+a*a)};for(let n=0;n<b;n++){if(T[n]>=0||w&&w[n]>0||e[n]<te&&t[n]<c.growDev)continue;let l=0,d=0,h=!1,re=0,ie=0,k=!1;for(E[l++]=n,T[n]=n;l>0;){let a=E[--l];if(D[d++]=a,e[a]>=te&&(h=!0),C[a]&&(k=!0),o&&s){let e=(a%r+.5)/r-.5,t=(Math.floor(a/r)+.5)/i-.5;o[a]-f(s,e,t)>c.lightDL&&ie++}let u=ne(a);u>re&&(re=u);let p=a%r,m=[p>0?a-1:-1,p<r-1?a+1:-1,a>=r?a-r:-1,a<b-r?a+r:-1];for(let r of m)r>=0&&T[r]<0&&!(w&&w[r]>0)&&(t[r]>=c.growDev||e[r]>=te)&&(T[r]=n,E[l++]=r)}let ae=h?1:u(c.growEdgeLo,c.growEdgeHi,re);{let e=0;for(let t=0;t<d;t++)D[t]>=b-r&&e++;ae*=1-u(c.bottomLo,c.bottomHi,e/r)}if(w){let e=0,t=0;for(let i=0;i<d;i++){let a=D[i],o=a%r,s=[o>0?a-1:-1,o<r-1?a+1:-1,a>=r?a-r:-1,a<b-r?a+r:-1];for(let r of s)r>=0&&T[r]!==n&&(e++,w[r]>0&&t++)}ae*=1-u(c.farShareLo,c.farShareHi,t/Math.max(1,e))}let A=o&&s&&p&&m?x(D,d,T,n,r,i,o,p,m,s,t):null;if(A&&g){let e=S(A);if(e>0)for(let t=0;t<d;t++)g[D[t]]=e}let oe=o&&s?u(c.lightShareLo,c.lightShareHi,ie/d):1;ee=Math.max(ee,oe*ae*u(c.minArea,2*c.minArea,d/b)),_&&d>=v.minPx&&d/b<=v.maxArea&&_.push(y(D,d,r,i,t,ae,h,A?S(A):0));let se=k?+(d/b>=.25*c.minArea):ae*u(1.5*c.minArea,2*c.minArea,d/b);if(se<=0)continue;O[n]=k?2:1;let j=new Float32Array(d);for(let e=0;e<d;e++)j[e]=t[D[e]];j.sort();let ce=c.relKeep*j[Math.min(d-1,Math.floor(.9*d))];for(let n=0;n<d;n++)(t[D[n]]>=ce||e[D[n]]>=te)&&(a[D[n]]=se)}let re=new Float32Array(b);h(a,re,r,i,c.closeR);for(let e=0;e<b;e++)re[e]=1-re[e];h(re,a,r,i,c.closeR);for(let e=0;e<b;e++)a[e]=1-a[e];let ie=new Uint8Array(b);for(let e=0;e<b;e++){if(ie[e]||a[e]<=0)continue;let n=0,i=0,o=0,s=new Set;for(E[n++]=e,ie[e]=1;n>0;){let e=E[--n];D[i++]=e,T[e]>=0&&O[T[e]]&&s.add(T[e]),t[e]>=c.solidDev&&o++;let l=e%r;for(let t=-1;t<=1;t++)for(let i=-1;i<=1;i++){let o=l+i,s=e+t*r+i;(i|t)===0||o<0||o>=r||s<0||s>=b||ie[s]||a[s]<=0||(ie[s]=1,E[n++]=s)}}let l=!1;for(let e of s)O[e]===2&&(l=!0);let d=l?1:s.size>=c.schoolN?0:u(c.solidLo,c.solidHi,o/i);if(d<1)for(let e=0;e<i;e++)a[D[e]]*=d}return ee}function x(e,t,n,r,i,a,o,s,c,l,u){let d=i*a,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=i,S=0,C=a,w=0;for(let ee=0;ee<t;ee++){let t=e[ee],T=t%i,E=(t-T)/i;y+=T,b+=E,x=Math.min(x,T),S=Math.max(S,T),C=Math.min(C,E),w=Math.max(w,E);let D=(T+.5)/i-.5,O=(E+.5)/a-.5,te=l[6]+l[7]*D+l[8]*O+l[9]*D*D+l[10]*D*O+l[11]*O*O,ne=l[12]+l[13]*D+l[14]*O+l[15]*D*D+l[16]*D*O+l[17]*O*O;h+=o[t]-f(l,D,O),g+=Math.hypot(s[t],c[t])/Math.max(.001,Math.hypot(te,ne));let re=T>0&&E>0&&T<i-1&&E<a-1;if(re&&n[t-1]===r&&n[t+1]===r&&n[t-i]===r&&n[t+i]===r)p+=Math.hypot(o[t+1]-o[t-1],o[t+i]-o[t-i])*.5,m++;else if(re){let e=0;for(let n=1;n<=2;n++)for(let r of[t-n,t+n,t-n*i,t+n*i])r>=0&&r<d&&(e=Math.max(e,Math.abs(u[t]-u[r])/n));_+=e,v++}}return{tex:m?p/m:0,dL:h/t,cr:g/t,aspect:(w-C+1)/(S-x+1),sharp:v?_/v:0,cx:y/t,cy:b/t}}function S(e){return(1-u(c.bubbleTexLo,c.bubbleTexHi,e.tex))*u(c.bubbleCrLo,c.bubbleCrHi,e.cr)*u(c.bubbleDLLo,c.bubbleDLHi,e.dL)*u(c.bubbleTallLo,c.bubbleTallHi,e.aspect)}function C(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function w(e){return e<=0?0:e>=1?1:e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}const ee=(()=>{let e=new Float32Array(256);for(let t=0;t<256;t++)e[t]=C(t/255);return e})();function T(e,t,n){return .2126*e+.7152*t+.0722*n}const E=Math.cbrt;function D(e,t,n){let r=E(.4122214708*e+.5363325363*t+.0514459929*n),i=E(.2119034982*e+.6806995451*t+.1073969566*n),a=E(.0883024619*e+.2817188376*t+.6299787005*n);return[.2104542553*r+.793617785*i-.0040720468*a,1.9779984951*r-2.428592205*i+.4505937099*a,.0259040371*r+.7827717662*i-.808675766*a]}function O(e,t,n){let r=e+.3963377774*t+.2158037573*n,i=e-.1055613458*t-.0638541728*n,a=e-.0894841775*t-1.291485548*n,o=r*r*r,s=i*i*i,c=a*a*a;return[4.0767416621*o-3.3077115913*s+.2309699292*c,-1.2684380046*o+2.6097574011*s-.3413193965*c,-.0041960863*o-.7034186147*s+1.707614701*c]}function te(e,t){let n=Math.atan2(t,e)*180/Math.PI;return n<0?n+360:n}const ne=.7,re=.7,ie=.94;function k(e){return e[0]>=0&&e[1]>=0&&e[2]>=0&&e[0]<=1&&e[1]<=1&&e[2]<=1}function ae(e,t,n){let r=0,i=.4;for(let a=0;a<10;a++){let a=.5*(r+i);k(O(e,t*a,n*a))?r=a:i=a}return r}function A(e,t,n,r=0){let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=t/i,o=n/i,s=ae(e,a,o),c=re*s;if(i<=c||s<=1e-5)return[t,n];let l=ie*s-c,u=Math.min(i,r,ie*s),d=Math.max(u,c+l*(1-Math.exp(-(i-c)/l)));return[a*d,o*d]}function oe(e,t,n){let r=Math.max(e,t,n);if(r>1){let i=Math.max(ne,1/r);e*=i,t*=i,n*=i}return se(e,t,n)}function se(e,t,n){let r=Math.min(1,Math.max(0,T(e,t,n))),i=1,a=[e,t,n];for(let e=0;e<3;e++){let t=a[e];t>1?i=Math.min(i,(1-r)/(t-r)):t<0&&(i=Math.min(i,(0-r)/(t-r)))}return i>=1?[e,t,n]:(i=Math.max(0,i),[r+i*(e-r),r+i*(t-r),r+i*(n-r)])}const j={hueLo:-30*Math.PI/180,hueHi:70*Math.PI/180,warmC:.06,warmL:.2,warmLo:.012,warmHi:.05,rgY:.15,rgLo:.78,rgHi:.95,bgLo0:.45,bgLo1:.6,bgHi0:1.25,bgHi1:1.5,floorLo:.15,floorHi:.3,floorMin:.015,floorWarmLo:1.05,floorWarmHi:1.2,floorMagentaLo:.85,floorMagentaHi:1,hazeLo:.2,hazeHi:.35,redToneLo:.06,redToneHi:.12,colourMax:.9,toneMax:.9,toneLookOff:.4,knee:.97};function ce(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const le=1024,ue={rg:new Uint32Array(le),bg:new Uint32Array(le),r:new Uint32Array(le),g:new Uint32Array(le),b:new Uint32Array(le)},de=.25;function fe(e,t){return Math.min(le-1,Math.max(0,le/t*e|0))}function pe(e,t,n,r){let i=n*t,a=0;for(let t=0;t<le;t++)if(a+=e[t],a>=i)return(t+.5)*r/le;return r}function me(e,t){for(let e of Object.values(ue))e.fill(0);let n=0,r=0,i=0,a=(j.hueLo+j.hueHi)/2,o=Math.cos(a),s=Math.sin(a),c=Math.cos((j.hueHi-j.hueLo)/2);for(let a=0;a<t;a+=3){let t=e[a*3],l=e[a*3+1],u=e[a*3+2];if(r++,ue.r[fe(t,de)]++,ue.g[fe(l,de)]++,ue.b[fe(u,de)]++,.2126*t+.7152*l+.0722*u>=j.rgY){let e=1/Math.max(1e-4,l);ue.rg[fe(t*e,4)]++,ue.bg[fe(u*e,4)]++,i++}if(t<=l*.9)continue;let[d,f,p]=D(t,l,u),m=Math.hypot(f,p);d>=j.warmL&&m>=j.warmC&&(f*o+p*s)/m>=c&&n++}let l=n/Math.max(1,r),u=i>=r*.02,d=u?pe(ue.rg,i,.5,4):0,f=u?pe(ue.bg,i,.5,4):0,p=pe(ue.r,r,.02,de),m=Math.max(pe(ue.g,r,.02,de),pe(ue.b,r,.02,de)),h=m<j.floorMin?1:p/m,g=ce(j.rgLo,j.rgHi,d)*ce(j.bgLo0,j.bgLo1,f)*(1-ce(j.bgHi0,j.bgHi1,f))*ce(j.floorLo,j.floorHi,h)*(1-ce(j.floorWarmLo,j.floorWarmHi,h)*ce(j.floorMagentaLo,j.floorMagentaHi,f));return{warm:l,rg:d,bg:f,floor:h,reds:ce(j.warmLo,j.warmHi,l),noCast:g}}function he(e,t){let n=1-ce(j.hazeLo,j.hazeHi,t),r=e.noCast*n,i=ce(j.redToneLo,j.redToneHi,e.warm)*n;return{calm:j.colourMax*Math.max(e.reds,r),calmTone:j.toneMax*Math.max(r,i)}}function ge(e){let t=Math.min(1,Math.max(0,e.calm??0)),n=Math.min(1,Math.max(0,e.calmTone??0));if(t<=0&&n<=0)return e;let r=e=>Math.max(1e-4,e)**(1-t),i=1-n;return{...e,wb:e.wb.map(r),waterWb:e.waterWb.map(r),attn:e.attn.map(e=>e*(1-t)),binf:e.binf.map(e=>e*(1-t)),exposure:Math.max(1e-4,e.exposure)**+i,levelsMix:e.levelsMix*i,toneGamma:1+((e.toneGamma??1)-1)*(1-Math.min(1,Math.max(t/j.colourMax,n/j.toneMax)/j.toneLookOff)),haze:e.haze*i,hazeBlack:e.hazeBlack*i,hazeFloor:e.hazeFloor.map(e=>e*i),knee:e.knee+(Math.max(e.knee,j.knee)-e.knee)*n}}function _e(e,t){let n=Math.min(1,Math.max(0,t.calmTone??0));return n<=0?e:{...e,clarity:e.clarity*(1-n),dehaze:e.dehaze*(1-n)}}const M=Math.PI/180,N={sigma:2,gainLo:1.25,gainHi:2,keepLo:15,keepHi:40,tolFrac:.35,tolLin:.004,snrLo:1.5,snrHi:6,snrMin:.25,waterRed:.8,waterSnrLo:4,waterSnrHi:12,hue:15*M,bandIn:35*M,bandOut:60*M,cMax:.15,knee:.65,pinkHue:5*M,pinkIn:40*M,pinkOut:60*M,whiteLo:.55,whiteHi:.78,whiteC:.015,magHue:335*M,magIn:35*M,magOut:55*M,magLLo:.35,magLHi:.5,magDir:45*M,magSrcLo:-.008,magSrcHi:.004,magCLo:.05,magCHi:.12,skinHueMin:15*M,skinCMax:.085,skinSrcCLo:.07,skinSrcCHi:.11,greenLo:1.15,greenHi:1.8,greenRMax:5,greenBMax:3,greenWater:.7,greenDehaze:.85,greenObj:.9,greenProp:.6,greenWarmR:1.1,greenWarmB:.9,veilGreenLo:1.35,veilGreenHi:1.85,veilChromaLo:.03,veilChromaHi:.06,greenLevelLo:.03,greenLevelHi:.08,gnHue:150*M,gnIn:20*M,gnOut:45*M,gnMix:.75,gnObjKeep:.7,gnTargetHue:240*M,gnTargetC:.012,matHue:70*M,matIn:40*M,matOut:65*M,matC:.05,matKnee:.6,litLo:.35,litHi:.55,litSub:3,murkHold:1,murkDark:.75,murkLo:.08,murkHi:.25};function ve(e,t,n){return e<t?t:e>n?n:e}function P(e,t,n){let r=ve((n-e)/(t-e),0,1);return r*r*(3-2*r)}function ye(e,t){return Se(e,t)*(1-xe(t))}function be(e,t){return Se(e,t)*xe(t)}function xe(e){return e?P(N.litLo,N.litHi,.2126*e[0]+.7152*e[1]+.0722*e[2]):0}function Se(e,t){let n=P(N.greenLo,N.greenHi,e[1]/Math.max(1e-4,e[2])),r=t?P(N.veilGreenLo,N.veilGreenHi,t[1]/Math.max(1e-4,t[2]))*P(N.veilChromaLo,N.veilChromaHi,Ce(t)):0;return Math.max(n,r)*P(N.greenLevelLo,N.greenLevelHi,e[1])}function Ce(e){let[,t,n]=D(Math.max(0,e[0]),Math.max(0,e[1]),Math.max(0,e[2]));return Math.hypot(t,n)}function we(e){return ye(e.binf,e.veilColor)*(1-Math.min(1,Math.max(0,e.calm??0)))}function Te(e,t){let n=N.greenDehaze*we(t);return n>e.dehaze?{...e,dehaze:Math.min(1,n)}:e}function Ee(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=P(Math.cos(N.gnOut),Math.cos(N.gnIn),(t*Math.cos(N.gnHue)+n*Math.sin(N.gnHue))/i),o=N.gnMix*r*a,s=N.gnTargetC*ve(e/.6,0,1.3);return[t+(s*Math.cos(N.gnTargetHue)-t)*o,n+(s*Math.sin(N.gnTargetHue)-n)*o]}function De(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of y){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*.12*.12));h+=f*c,g+=f*l,_+=f*u,v+=f}if(v<1e-6)return[r,i,a];let b=Math.min(1,v/.08);return[r+(h/v-r)*b,i+(g/v-i)*b,a+(_/v-a)*b]}function Oe(e,t){return 255*Math.max(0,w(Math.max(0,e))-w(Math.max(0,Math.min(e,t))))/N.sigma}function ke(e,t,n,r){let i=[0,0,0],a=0;for(let e=0;e<3;e++){let o=Oe(t[e],r[e]);e===0&&(a=o),i[e]=P(N.gainLo,N.gainHi,n[e]/Math.max(1e-4,n[1]))*(1-P(N.keepLo,N.keepHi,o))}let o=[.2126,.7152,.0722],s=0,c=0;for(let n=0;n<3;n++){let r=o[n]*(1-.95*i[n]);s+=r*e[n],c+=r*t[n]}let l=c>1e-6?s/c:1,u=[e[0],e[1],e[2]];for(let n=0;n<3;n++){let r=N.tolFrac*e[n]+N.tolLin,a=ve(t[n]*l,e[n]-r,e[n]+r);u[n]=e[n]+(a-e[n])*i[n]}return{c:u,snrR:a}}function Ae(e,t,n){let r=N.waterRed*P(N.waterSnrLo,N.waterSnrHi,n);return e*Math.max(1,t/Math.max(1e-4,e))**+r}function je(e,t,n,r,i){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=N.matKnee*N.matC;if(a<=o)return[t,n];let s=P(Math.cos(N.matOut),Math.cos(N.matIn),(t*Math.cos(N.matHue)+n*Math.sin(N.matHue))/a),c=r*(1-i)*s*P(.2,.3,e)*(1-P(.85,.95,e));if(c<=0)return[t,n];let l=N.matC-o,u=a+(o+l*(1-Math.exp(-(a-o)/l))-a)*c;return[t*u/a,n*u/a]}function Me(e,t,n){let r=t*(N.murkDark+(1-N.murkDark)*P(N.murkLo,N.murkHi,t));return n<=0||e<=r?e:e+(r-e)*n*N.murkHold}function Ne(e){return N.snrMin+(1-N.snrMin)*P(N.snrLo,N.snrHi,e)}function Pe(e,t,n,r,i,a,o){let s=Math.hypot(t,n);if(s<1e-5)return[t,n];let c=P(Math.cos(N.bandOut),Math.cos(N.bandIn),(t*Math.cos(N.hue)+n*Math.sin(N.hue))/s),l=P(Math.cos(N.pinkOut),Math.cos(N.pinkIn),(t*Math.cos(N.pinkHue)+n*Math.sin(N.pinkHue))/s),u=Math.hypot(r,i),d=P(.1,.5,a)*(1-P(N.skinSrcCLo,N.skinSrcCHi,u))*(1-o)*P(.3,.45,e),f=Math.atan2(n,t);if(d>0){let e=f<N.skinHueMin&&f>-Math.PI/2?N.skinHueMin:f;f+=(e-f)*d}let p=N.cMax+(N.whiteC-N.cMax)*P(N.whiteLo,N.whiteHi,e)*l*(1-d),m=P(Math.cos(N.magOut),Math.cos(N.magIn),(t*Math.cos(N.magHue)+n*Math.sin(N.magHue))/s)*(1-P(N.magSrcLo,N.magSrcHi,r*Math.cos(N.magDir)+i*Math.sin(N.magDir)))*P(N.magLLo,N.magLHi,e)*(1-P(N.magCLo,N.magCHi,s))*(1-d);p=Math.min(p,N.cMax+(N.whiteC-N.cMax)*m),p+=(Math.min(p,N.skinCMax)-p)*d;let h=u>1e-5?(r*Math.cos(N.hue)+i*Math.sin(N.hue))/u:0,g=u*P(Math.cos(N.bandOut),Math.cos(N.bandIn),h);p=Math.max(p,g);let _=Math.max(c,l,d,m),v=Math.max(N.knee*p,g),y=s;if(y>v&&_>0){let e=p-v,t=v+e*(1-Math.exp(-(y-v)/Math.max(1e-6,e)));y+=(t-y)*_}return y===s&&d<=0?[t,n]:[y*Math.cos(f),y*Math.sin(f)]}const Fe=`
const float RED_SIGMA = ${N.sigma.toFixed(4)};
const float RED_GAIN_LO = ${N.gainLo.toFixed(4)};
const float RED_GAIN_HI = ${N.gainHi.toFixed(4)};
const float RED_KEEP_LO = ${N.keepLo.toFixed(4)};
const float RED_KEEP_HI = ${N.keepHi.toFixed(4)};
const float RED_TOL_FRAC = ${N.tolFrac.toFixed(4)};
const float RED_TOL_LIN = ${N.tolLin.toFixed(5)};
const float RED_SNR_LO = ${N.snrLo.toFixed(4)};
const float RED_SNR_HI = ${N.snrHi.toFixed(4)};
const float RED_SNR_MIN = ${N.snrMin.toFixed(4)};
const float RED_WATER_RED = ${N.waterRed.toFixed(4)};
const float RED_WATER_SNR_LO = ${N.waterSnrLo.toFixed(4)};
const float RED_WATER_SNR_HI = ${N.waterSnrHi.toFixed(4)};
const float RED_HUE_COS = ${Math.cos(N.hue).toFixed(6)};
const float RED_HUE_SIN = ${Math.sin(N.hue).toFixed(6)};
const float RED_COS_IN = ${Math.cos(N.bandIn).toFixed(6)};
const float RED_COS_OUT = ${Math.cos(N.bandOut).toFixed(6)};
const float RED_PINK_COS = ${Math.cos(N.pinkHue).toFixed(6)};
const float RED_PINK_SIN = ${Math.sin(N.pinkHue).toFixed(6)};
const float RED_PINK_COS_IN = ${Math.cos(N.pinkIn).toFixed(6)};
const float RED_PINK_COS_OUT = ${Math.cos(N.pinkOut).toFixed(6)};
const float RED_MAG_COS = ${Math.cos(N.magHue).toFixed(6)};
const float RED_MAG_SIN = ${Math.sin(N.magHue).toFixed(6)};
const float RED_MAG_COS_IN = ${Math.cos(N.magIn).toFixed(6)};
const float RED_MAG_COS_OUT = ${Math.cos(N.magOut).toFixed(6)};
const float RED_MAG_L_LO = ${N.magLLo.toFixed(4)};
const float RED_MAG_L_HI = ${N.magLHi.toFixed(4)};
const float RED_MAG_DIR_COS = ${Math.cos(N.magDir).toFixed(6)};
const float RED_MAG_DIR_SIN = ${Math.sin(N.magDir).toFixed(6)};
const float RED_MAG_SRC_LO = ${N.magSrcLo.toFixed(4)};
const float RED_MAG_SRC_HI = ${N.magSrcHi.toFixed(4)};
const float RED_MAG_C_LO = ${N.magCLo.toFixed(4)};
const float RED_MAG_C_HI = ${N.magCHi.toFixed(4)};
const float RED_C_MAX = ${N.cMax.toFixed(4)};
const float RED_KNEE = ${N.knee.toFixed(4)};
const float RED_WHITE_LO = ${N.whiteLo.toFixed(4)};
const float RED_WHITE_HI = ${N.whiteHi.toFixed(4)};
const float RED_WHITE_C = ${N.whiteC.toFixed(4)};
const float RED_SKIN_HUE_MIN = ${N.skinHueMin.toFixed(6)};
const float RED_SKIN_C_MAX = ${N.skinCMax.toFixed(4)};
const float RED_SKIN_SRC_C_LO = ${N.skinSrcCLo.toFixed(4)};
const float RED_SKIN_SRC_C_HI = ${N.skinSrcCHi.toFixed(4)};
const float RED_GREEN_PROP = ${N.greenProp.toFixed(4)};
const float RED_GREEN_OBJ = ${N.greenObj.toFixed(4)};
const float RED_MAT_COS = ${Math.cos(N.matHue).toFixed(6)};
const float RED_MAT_SIN = ${Math.sin(N.matHue).toFixed(6)};
const float RED_MAT_COS_IN = ${Math.cos(N.matIn).toFixed(6)};
const float RED_MAT_COS_OUT = ${Math.cos(N.matOut).toFixed(6)};
const float RED_MAT_C = ${N.matC.toFixed(4)};
const float RED_MAT_KNEE = ${N.matKnee.toFixed(4)};
const float RED_MURK_HOLD = ${N.murkHold.toFixed(4)};
const float RED_MURK_DARK = ${N.murkDark.toFixed(4)};
const float RED_MURK_LO = ${N.murkLo.toFixed(4)};
const float RED_MURK_HI = ${N.murkHi.toFixed(4)};
const float RED_GN_COS = ${Math.cos(N.gnHue).toFixed(6)};
const float RED_GN_SIN = ${Math.sin(N.gnHue).toFixed(6)};
const float RED_GN_COS_IN = ${Math.cos(N.gnIn).toFixed(6)};
const float RED_GN_COS_OUT = ${Math.cos(N.gnOut).toFixed(6)};
const float RED_GN_OBJ_KEEP = ${N.gnObjKeep.toFixed(4)};
const float RED_GN_MIX = ${N.gnMix.toFixed(4)};
const float RED_GN_TA = ${(N.gnTargetC*Math.cos(N.gnTargetHue)).toFixed(6)};
const float RED_GN_TB = ${(N.gnTargetC*Math.sin(N.gnTargetHue)).toFixed(6)};
`,Ie=Fe.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),Le=`${Fe}
// guideSmooth's GPU twin is computed inside sampleFields (grade-shader.ts): the same texels and weights.
vec3 chromaRebuild(vec3 lin, vec3 s, vec3 gain, vec3 bs, out float snrR) {
  vec3 snr = 255.0 * max(linearToSrgb(max(s, vec3(0.0))) - linearToSrgb(max(min(s, bs), vec3(0.0))), vec3(0.0)) / RED_SIGMA;
  snrR = snr.r;
  vec3 g = gain / max(1e-4, gain.g);
  vec3 w = vec3(
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.r) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.r)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.g) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.g)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.b) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.b)));
  vec3 u = vec3(0.2126, 0.7152, 0.0722) * (1.0 - 0.95 * w);
  float den = dot(u, s);
  float delta = den > 1e-6 ? dot(u, lin) / den : 1.0;
  vec3 tol = RED_TOL_FRAC * lin + RED_TOL_LIN;
  vec3 rb = clamp(s * delta, lin - tol, lin + tol);
  return lin + (rb - lin) * w;
}
vec2 greenNeutral(float L, vec2 ab, float g) {
  if (g <= 0.0) return ab;
  float C = length(ab);
  if (C < 1e-5) return ab;
  float t = RED_GN_MIX * g * smoothstepf(RED_GN_COS_OUT, RED_GN_COS_IN, dot(ab, vec2(RED_GN_COS, RED_GN_SIN)) / C);
  return mix(ab, vec2(RED_GN_TA, RED_GN_TB) * clamp(L / 0.6, 0.0, 1.3), t);
}
float waterRedGain(float water, float full, float snrR) {
  float t = RED_WATER_RED * smoothstepf(RED_WATER_SNR_LO, RED_WATER_SNR_HI, snrR);
  return water * pow(max(1.0, full / max(1e-4, water)), t);
}
vec2 warmMaterial(float L, vec2 ab, float g, float srcFar) {
  if (g <= 0.0) return ab;
  float C = length(ab);
  float knee = RED_MAT_KNEE * RED_MAT_C;
  if (C <= knee) return ab;
  float band = smoothstepf(RED_MAT_COS_OUT, RED_MAT_COS_IN, dot(ab, vec2(RED_MAT_COS, RED_MAT_SIN)) / C);
  float w = g * (1.0 - srcFar) * band * smoothstepf(0.2, 0.3, L) * (1.0 - smoothstepf(0.85, 0.95, L));
  if (w <= 0.0) return ab;
  float room = RED_MAT_C - knee;
  float rolled = knee + room * (1.0 - exp(-(C - knee) / room));
  return ab * ((C + (rolled - C) * w) / C);
}
float murkHold(float y, float ySrc, float g) {
  float cap = ySrc * (RED_MURK_DARK + (1.0 - RED_MURK_DARK) * smoothstepf(RED_MURK_LO, RED_MURK_HI, ySrc));
  if (g <= 0.0 || y <= cap) return y;
  return y + (cap - y) * g * RED_MURK_HOLD;
}
float redGainStrength(float snrR) { return RED_SNR_MIN + (1.0 - RED_SNR_MIN) * smoothstepf(RED_SNR_LO, RED_SNR_HI, snrR); }
vec2 redGuard(float L, vec2 ab, vec2 ab0, float person, float srcFar) {
  float C = length(ab);
  if (C < 1e-5) return ab;
  vec2 hv = vec2(RED_HUE_COS, RED_HUE_SIN);
  float band = smoothstepf(RED_COS_OUT, RED_COS_IN, dot(ab, hv) / C);
  float pink = smoothstepf(RED_PINK_COS_OUT, RED_PINK_COS_IN, dot(ab, vec2(RED_PINK_COS, RED_PINK_SIN)) / C);
  float cSrc = length(ab0);
  float ws = smoothstepf(0.1, 0.5, person) * (1.0 - smoothstepf(RED_SKIN_SRC_C_LO, RED_SKIN_SRC_C_HI, cSrc)) * (1.0 - srcFar) * smoothstepf(0.3, 0.45, L);
  float h = atan(ab.y, ab.x);
  if (ws > 0.0) {
    float hr = (h < RED_SKIN_HUE_MIN && h > -1.5707963) ? RED_SKIN_HUE_MIN : h;
    h += (hr - h) * ws;
  }
  float cap = RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * smoothstepf(RED_WHITE_LO, RED_WHITE_HI, L) * pink * (1.0 - ws);
  float mag = smoothstepf(RED_MAG_COS_OUT, RED_MAG_COS_IN, dot(ab, vec2(RED_MAG_COS, RED_MAG_SIN)) / C) * (1.0 - smoothstepf(RED_MAG_SRC_LO, RED_MAG_SRC_HI, dot(ab0, vec2(RED_MAG_DIR_COS, RED_MAG_DIR_SIN)))) * smoothstepf(RED_MAG_L_LO, RED_MAG_L_HI, L) * (1.0 - smoothstepf(RED_MAG_C_LO, RED_MAG_C_HI, C)) * (1.0 - ws);
  cap = min(cap, RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * mag);
  cap += (min(cap, RED_SKIN_C_MAX) - cap) * ws;
  float cosr0 = cSrc > 1e-5 ? dot(ab0, hv) / cSrc : 0.0;
  float held = cSrc * smoothstepf(RED_COS_OUT, RED_COS_IN, cosr0);
  cap = max(cap, held);
  float w = max(max(band, pink), max(ws, mag));
  float knee = max(RED_KNEE * cap, held);
  float C2 = C;
  if (C2 > knee && w > 0.0) {
    float room = cap - knee;
    float rolled = knee + room * (1.0 - exp(-(C2 - knee) / max(1e-6, room)));
    C2 += (rolled - C2) * w;
  }
  if (C2 == C && ws <= 0.0) return ab;
  return C2 * vec2(cos(h), sin(h));
}`,Re=`${Ie}
// guideSmooth: see sampleFields in grade-shader.ts.
// Rebuilt colour in .xyz, red SNR in .w.
fn chromaRebuild(lin: vec3<f32>, s: vec3<f32>, gain: vec3<f32>, bs: vec3<f32>) -> vec4<f32> {
  let snr = 255.0 * max(linearToSrgb(max(s, vec3(0.0))) - linearToSrgb(max(min(s, bs), vec3(0.0))), vec3(0.0)) / RED_SIGMA;
  let g = gain / max(1e-4, gain.g);
  let w = vec3(
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.r) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.r)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.g) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.g)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.b) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.b)));
  let u = vec3(0.2126, 0.7152, 0.0722) * (1.0 - 0.95 * w);
  let den = dot(u, s);
  let delta = select(1.0, dot(u, lin) / den, den > 1e-6);
  let tol = RED_TOL_FRAC * lin + RED_TOL_LIN;
  let rb = clamp(s * delta, lin - tol, lin + tol);
  return vec4<f32>(lin + (rb - lin) * w, snr.r);
}
fn greenNeutral(L: f32, ab: vec2<f32>, g: f32) -> vec2<f32> {
  if (g <= 0.0) { return ab; }
  let C = length(ab);
  if (C < 1e-5) { return ab; }
  let t = RED_GN_MIX * g * smoothstepf(RED_GN_COS_OUT, RED_GN_COS_IN, dot(ab, vec2(RED_GN_COS, RED_GN_SIN)) / C);
  return mix(ab, vec2(RED_GN_TA, RED_GN_TB) * clamp(L / 0.6, 0.0, 1.3), t);
}
fn waterRedGain(water: f32, full: f32, snrR: f32) -> f32 {
  let t = RED_WATER_RED * smoothstepf(RED_WATER_SNR_LO, RED_WATER_SNR_HI, snrR);
  return water * pow(max(1.0, full / max(1e-4, water)), t);
}
fn warmMaterial(L: f32, ab: vec2<f32>, g: f32, srcFar: f32) -> vec2<f32> {
  if (g <= 0.0) { return ab; }
  let C = length(ab);
  let knee = RED_MAT_KNEE * RED_MAT_C;
  if (C <= knee) { return ab; }
  let band = smoothstepf(RED_MAT_COS_OUT, RED_MAT_COS_IN, dot(ab, vec2(RED_MAT_COS, RED_MAT_SIN)) / C);
  let w = g * (1.0 - srcFar) * band * smoothstepf(0.2, 0.3, L) * (1.0 - smoothstepf(0.85, 0.95, L));
  if (w <= 0.0) { return ab; }
  let room = RED_MAT_C - knee;
  let rolled = knee + room * (1.0 - exp(-(C - knee) / room));
  return ab * ((C + (rolled - C) * w) / C);
}
fn murkHold(y: f32, ySrc: f32, g: f32) -> f32 {
  let cap = ySrc * (RED_MURK_DARK + (1.0 - RED_MURK_DARK) * smoothstepf(RED_MURK_LO, RED_MURK_HI, ySrc));
  if (g <= 0.0 || y <= cap) { return y; }
  return y + (cap - y) * g * RED_MURK_HOLD;
}
fn redGainStrength(snrR: f32) -> f32 { return RED_SNR_MIN + (1.0 - RED_SNR_MIN) * smoothstepf(RED_SNR_LO, RED_SNR_HI, snrR); }
fn redGuard(L: f32, ab: vec2<f32>, ab0: vec2<f32>, person: f32, srcFar: f32) -> vec2<f32> {
  let C = length(ab);
  if (C < 1e-5) { return ab; }
  let hv = vec2(RED_HUE_COS, RED_HUE_SIN);
  let band = smoothstepf(RED_COS_OUT, RED_COS_IN, dot(ab, hv) / C);
  let pink = smoothstepf(RED_PINK_COS_OUT, RED_PINK_COS_IN, dot(ab, vec2(RED_PINK_COS, RED_PINK_SIN)) / C);
  let cSrc = length(ab0);
  let ws = smoothstepf(0.1, 0.5, person) * (1.0 - smoothstepf(RED_SKIN_SRC_C_LO, RED_SKIN_SRC_C_HI, cSrc)) * (1.0 - srcFar) * smoothstepf(0.3, 0.45, L);
  var h = atan2(ab.y, ab.x);
  if (ws > 0.0) {
    let hr = select(h, RED_SKIN_HUE_MIN, h < RED_SKIN_HUE_MIN && h > -1.5707963);
    h += (hr - h) * ws;
  }
  var cap = RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * smoothstepf(RED_WHITE_LO, RED_WHITE_HI, L) * pink * (1.0 - ws);
  let mag = smoothstepf(RED_MAG_COS_OUT, RED_MAG_COS_IN, dot(ab, vec2(RED_MAG_COS, RED_MAG_SIN)) / C) * (1.0 - smoothstepf(RED_MAG_SRC_LO, RED_MAG_SRC_HI, dot(ab0, vec2(RED_MAG_DIR_COS, RED_MAG_DIR_SIN)))) * smoothstepf(RED_MAG_L_LO, RED_MAG_L_HI, L) * (1.0 - smoothstepf(RED_MAG_C_LO, RED_MAG_C_HI, C)) * (1.0 - ws);
  cap = min(cap, RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * mag);
  cap += (min(cap, RED_SKIN_C_MAX) - cap) * ws;
  let cosr0 = select(0.0, dot(ab0, hv) / cSrc, cSrc > 1e-5);
  let held = cSrc * smoothstepf(RED_COS_OUT, RED_COS_IN, cosr0);
  cap = max(cap, held);
  let w = max(max(band, pink), max(ws, mag));
  let knee = max(RED_KNEE * cap, held);
  var C2 = C;
  if (C2 > knee && w > 0.0) {
    let room = cap - knee;
    let rolled = knee + room * (1.0 - exp(-(C2 - knee) / max(1e-6, room)));
    C2 += (rolled - C2) * w;
  }
  if (C2 == C && ws <= 0.0) { return ab; }
  return C2 * vec2(cos(h), sin(h));
}`,ze=[`sh`,`mid`,`hi`,`rot`,`sat`,`coolSat`,`warmSat`,`satL`,`shA`,`shB`,`hiA`,`hiB`],F={sh:0,mid:0,hi:0,rot:0,sat:0,coolSat:0,warmSat:0,satL:0,shA:0,shB:0,hiA:0,hiB:0};25*Math.PI/180;const Be={cool:240*Math.PI/180,coolIn:50*Math.PI/180,coolOut:95*Math.PI/180,warm:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:80*Math.PI/180,protLo:.015,protHi:.05},Ve={vivid:{...F},blue:{...F}},I=e=>Math.min(1,Math.max(0,e));function He(e,t,n){let r=I((n-e)/(t-e));return r*r*(3-2*r)}const Ue=256/27;function We(e){let t=I(e),n=1-t;return[Ue*t*n*n*n,16*t*t*n*n,Ue*t*t*t*n]}const Ge=(e,t,n)=>{if(n<=0)return e;let r={...e};for(let i of ze)r[i]=e[i]+(t[i]-e[i])*n;return r};function Ke(e,t,n,r,i=0,a=Ve){if(r<=0)return[e,t,n];let o=Ge(a.vivid,a.blue,I(i)),s=Be,c=I(e),[l,u,d]=We(c),f=e+r*(o.sh*l+o.mid*u+o.hi*d),p=Math.hypot(t,n),m=0,h=0;if(p>1e-6){let e=Math.atan2(n,t),r=t=>{let n=e-t;return Math.abs(n-2*Math.PI*Math.round(n/(2*Math.PI)))};m=1-He(s.coolIn,s.coolOut,r(s.cool)),h=1-He(s.warmIn,s.warmOut,r(s.warm))}let g=r*o.rot*m,_=Math.cos(g),v=Math.sin(g),y=Math.max(0,1+r*(o.sat+o.coolSat*m+o.warmSat*h+o.satL*(2*c-1))),b=r*(1-h*He(s.protLo,s.protHi,p));return[f,(t*_-n*v)*y+b*(o.shA*l+o.hiA*d),(t*v+n*_)*y+b*(o.shB*l+o.hiB*d)]}const L=e=>ze.every(t=>e[t]===0);function qe(e,t,n=Ve){let r=Ye(t);return r<1&&!L(n.vivid)||r>0&&!L(n.blue)?Je(e,t):0}function Je(e,t){let n=I(Math.max(e.calm??0,e.calmTone??0)),r=Ye(t),i=I(e.vividGate??1),a=i+(I(e.blueGate??e.vividGate??1)-i)*r;return I(t.vivid??0)*(1-He(bt.calmLo,bt.calmHi,n))*(1-He(Ot.calmLo,Ot.calmHi,n))*a}function Ye(e){return I(e.blue??0)}const Xe={hue:45*Math.PI/180,warmIn:60*Math.PI/180,warmOut:100*Math.PI/180,hueKeep:.4,knee:.05,cap:.08,rest:.03,restMix:.5,coolCut:.85,srcLo:.035,srcHi:.065,coolLo:.03,coolHi:.055,lLo:.3,lHi:.45,hiLo:.86,hiHi:.95};function Ze(e,t){let n=Xe,r=Math.hypot(e,t);return r<1e-6?0:He(n.srcLo,n.srcHi,r)*(1-He(Math.cos(n.warmOut),Math.cos(n.warmIn),(e*Math.cos(n.hue)+t*Math.sin(n.hue))/r))}function Qe(e,t,n,r,i,a=0){if(r<=0&&i<=0)return[t,n];let o=Xe,s=Math.cos(o.hue),c=Math.sin(o.hue),l=Math.hypot(t,n),u=t*s+n*c,d=n*s-t*c,f=l>1e-6?He(Math.cos(o.warmOut),Math.cos(o.warmIn),u/l):0,p=I(r)*f;d*=1-(1-o.hueKeep)*p;let m=Math.hypot(u,d),h=1-o.coolCut*I(a),g=o.knee*h,_=(o.cap-o.knee)*h;if(m>g){let e=1+((g+_*(1-Math.exp(-(m-g)/_)))/m-1)*p;u*=e,d*=e}let v=I(i)*o.restMix*He(o.lLo,o.lHi,e)*(1-He(o.hiLo,o.hiHi,e))*(1-He(o.coolLo,o.coolHi,l));return u+=(Math.max(u,o.rest)-u)*v,d*=1-v,[u*s-d*c,u*c+d*s]}const R=e=>{let t=e.toFixed(7).replace(/0+$/,``);return t.endsWith(`.`)?t+`0`:t},$e=e=>t=>`mix(${R(e.vivid[t])}, ${R(e.blue[t])}, m)`,z=Be,B=Xe;function et(e=Ve){let t=$e(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
float fitLookDist(float h, float h0) { float d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
vec3 fitLook(vec3 lab, float t, float m) {
  if (t <= 0.0) return lab;
  float x = clamp(lab.x, 0.0, 1.0), y = 1.0 - x;
  float S = ${R(Ue)} * x * y * y * y, M = 16.0 * x * x * y * y, H = ${R(Ue)} * x * x * x * y;
  float L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  float C = length(lab.yz);
  float cool = 0.0, warm = 0.0;
  if (C > 1e-6) {
    float h = atan(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${R(z.coolIn)}, ${R(z.coolOut)}, fitLookDist(h, ${R(z.cool)}));
    warm = 1.0 - smoothstepf(${R(z.warmIn)}, ${R(z.warmOut)}, fitLookDist(h, ${R(z.warm)}));
  }
  float ang = t * ${t(`rot`)} * cool, cs = cos(ang), sn = sin(ang);
  float k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  float tw = t * (1.0 - warm * smoothstepf(${R(z.protLo)}, ${R(z.protHi)}, C));
  return vec3(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
float skinGuardCool(vec2 ab0) {
  float C = length(ab0);
  if (C < 1e-6) return 0.0;
  return smoothstepf(${R(B.srcLo)}, ${R(B.srcHi)}, C) * (1.0 - smoothstepf(${R(Math.cos(B.warmOut))}, ${R(Math.cos(B.warmIn))}, dot(ab0, vec2(${R(Math.cos(B.hue))}, ${R(Math.sin(B.hue))})) / C));
}
vec2 skinGuard(vec3 lab, float cap, float rest, float cool) {
  if (cap <= 0.0 && rest <= 0.0) return lab.yz;
  vec2 d = vec2(${R(Math.cos(B.hue))}, ${R(Math.sin(B.hue))});
  float C = length(lab.yz);
  float s = dot(lab.yz, d), o = lab.z * d.x - lab.y * d.y;
  float warm = C > 1e-6 ? smoothstepf(${R(Math.cos(B.warmOut))}, ${R(Math.cos(B.warmIn))}, s / C) : 0.0;
  float kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${R(1-B.hueKeep)} * kw;
  float C1 = length(vec2(s, o));
  float lim = 1.0 - ${R(B.coolCut)} * clamp(cool, 0.0, 1.0), knee = ${R(B.knee)} * lim, room = ${R(B.cap-B.knee)} * lim;
  if (C1 > knee) {
    float q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  float kr = clamp(rest, 0.0, 1.0) * ${R(B.restMix)} * smoothstepf(${R(B.lLo)}, ${R(B.lHi)}, lab.x) * (1.0 - smoothstepf(${R(B.hiLo)}, ${R(B.hiHi)}, lab.x)) * (1.0 - smoothstepf(${R(B.coolLo)}, ${R(B.coolHi)}, C));
  s += (max(s, ${R(B.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2(s * d.x - o * d.y, s * d.y + o * d.x);
}`}function tt(e=Ve){let t=$e(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
fn fitLookDist(h: f32, h0: f32) -> f32 { let d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
fn fitLook(lab: vec3<f32>, t: f32, m: f32) -> vec3<f32> {
  if (t <= 0.0) { return lab; }
  let x = clamp(lab.x, 0.0, 1.0);
  let y = 1.0 - x;
  let S = ${R(Ue)} * x * y * y * y;
  let M = 16.0 * x * x * y * y;
  let H = ${R(Ue)} * x * x * x * y;
  let L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  let C = length(lab.yz);
  var cool = 0.0;
  var warm = 0.0;
  if (C > 1e-6) {
    let h = atan2(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${R(z.coolIn)}, ${R(z.coolOut)}, fitLookDist(h, ${R(z.cool)}));
    warm = 1.0 - smoothstepf(${R(z.warmIn)}, ${R(z.warmOut)}, fitLookDist(h, ${R(z.warm)}));
  }
  let ang = t * ${t(`rot`)} * cool;
  let cs = cos(ang);
  let sn = sin(ang);
  let k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  let tw = t * (1.0 - warm * smoothstepf(${R(z.protLo)}, ${R(z.protHi)}, C));
  return vec3<f32>(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
fn skinGuardCool(ab0: vec2<f32>) -> f32 {
  let C = length(ab0);
  if (C < 1e-6) { return 0.0; }
  return smoothstepf(${R(B.srcLo)}, ${R(B.srcHi)}, C) * (1.0 - smoothstepf(${R(Math.cos(B.warmOut))}, ${R(Math.cos(B.warmIn))}, dot(ab0, vec2<f32>(${R(Math.cos(B.hue))}, ${R(Math.sin(B.hue))})) / C));
}
fn skinGuard(lab: vec3<f32>, cap: f32, rest: f32, cool: f32) -> vec2<f32> {
  if (cap <= 0.0 && rest <= 0.0) { return lab.yz; }
  let d = vec2<f32>(${R(Math.cos(B.hue))}, ${R(Math.sin(B.hue))});
  let C = length(lab.yz);
  var s = dot(lab.yz, d);
  var o = lab.z * d.x - lab.y * d.y;
  var warm = 0.0;
  if (C > 1e-6) { warm = smoothstepf(${R(Math.cos(B.warmOut))}, ${R(Math.cos(B.warmIn))}, s / C); }
  let kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${R(1-B.hueKeep)} * kw;
  let C1 = length(vec2<f32>(s, o));
  let lim = 1.0 - ${R(B.coolCut)} * clamp(cool, 0.0, 1.0);
  let knee = ${R(B.knee)} * lim;
  let room = ${R(B.cap-B.knee)} * lim;
  if (C1 > knee) {
    let q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  let kr = clamp(rest, 0.0, 1.0) * ${R(B.restMix)} * smoothstepf(${R(B.lLo)}, ${R(B.lHi)}, lab.x) * (1.0 - smoothstepf(${R(B.hiLo)}, ${R(B.hiHi)}, lab.x)) * (1.0 - smoothstepf(${R(B.coolLo)}, ${R(B.coolHi)}, C));
  s += (max(s, ${R(B.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2<f32>(s * d.x - o * d.y, s * d.y + o * d.x);
}`}const nt={mu0:.53214829,mu1:.51309827,mu2:-.91066194},rt={auto:{red:1,blue:1,redMax:5,dehaze:0,clarity:0,exposure:1,hazeLift:0},murky:{red:1.1,blue:1.2,redMax:5,dehaze:.65,clarity:.35,exposure:1.1,hazeLift:.9},deep:{red:1.5,blue:.9,redMax:5,dehaze:.25,clarity:.15,exposure:1.05,hazeLift:.5},reef:{red:1,blue:1,redMax:1.6,dehaze:0,clarity:-.1,exposure:.97,hazeLift:0}},it={intensity:1,saturation:1,clarity:.15,veil:.7,look:0,preset:`auto`,subjectPop:!1,subjectPopStrength:.5,subjectPopWarmth:.5,seabed:.6,vivid:0,blue:0,noiseReduction:`auto`},at={lo:.55,hi:.78},ot={lo:.06,hi:.18},st={lo:.05,hi:.2},ct={floor:.25,soft:.12,chroma:.7,farKeep:.6};function lt(e,t){if(t<=0||e.hazeBlack<=0)return[0,0,0];let n=ct.chroma;return e.hazeFloor.map(r=>t*((1-n)*e.hazeBlack+n*Math.min(Math.max(r,0),2*e.hazeBlack)))}function ut(e,t){if(t<=0)return 1;let n=(e-t)/((1-t)*Math.max(e,1e-6)),r=n-ct.floor,i=1-ct.floor,a=ct.soft*ct.soft;return .5*(n+ct.floor+Math.sqrt(r*r+a))-.5*(Math.sqrt(i*i+a)-i)}const dt={sigma:.009,k:1/(6*.009*.009),eps:.004,rMin:.5,rMax:2},ft=[[-2.5,-2.5,1],[2.5,-2.5,1],[-2.5,2.5,1],[2.5,2.5,1],[-6.5,-1.5,.7],[6.5,1.5,.7],[-1.5,6.5,.7],[1.5,-6.5,.7],[-6.5,1.5,.7],[6.5,-1.5,.7],[1.5,6.5,.7],[-1.5,-6.5,.7]],pt={k:.35,cMax:.045,desat:-.15,edgeFloor:.3},V={hue:75*Math.PI/180,chroma:.02,keep:.15,lift:.06,grid:6,wLo:0,wHi:.55,lo:.1,span:.8,redLo:.12,redHi:.35,bandLo:-.1,bandHi:-.02,y0:.2,y1:.5},H={hue:78*Math.PI/180,cMin:.05,cMax:.075,keep:.4,lLo:.2,lHi:.55,wLo:.03,wHi:.3,side:4,castLo:.015,castHi:.045},U={vividKeep:.8,clarity:.22,lift:.1,chromaFollow:.3,chromaFollowDark:.7,engineKeep:.5,keepDarkLo:.25,keepDarkHi:.4,darkLo:.2,darkHi:.45,hueMax:20*Math.PI/180},W={darkLo:.1,darkHi:.28,popGate:4,cast:.45,castMax:.62,hue:65*Math.PI/180,warm:.014,warmShare:.12,litLo:.1,litHi:.35,hiLo:.85,hiHi:.97,detail:.25,rMin:.7,rMax:1.45,lift:.012,boostWarm:.03,boostWarmShare:.15,boostDetail:.7,boostLift:.025,edge:3,farKeep:.35,veilLo:.065,veilHi:.125,pack:32,levels:16};function mt(e){return 2*Math.min(1,Math.max(0,e.subjectPopStrength??.5))}const G={hue:195*Math.PI/180,bandIn:45*Math.PI/180,bandOut:85*Math.PI/180,rLo:.08,rHi:.3,mix:.92,silver:.022,lLo:.12,lHi:.32,farLo:30*Math.PI/180,farHi:60*Math.PI/180,lift:.05,confLo:.05,confHi:.5,warmHue:50*Math.PI/180,warmLo:.1,warmHi:.5};function ht(e){return Math.min(1,Math.max(0,e.backdrop??0))*(1-Math.min(1,Math.max(0,e.calmTone??0)))}const gt={cLo:.06,cHi:.12,keep:.95},K={gamma:0,dim:.5,liftRelief:.6,liftRef:.1,hazeDehaze:.4,hazeClarity:.4,hazeLevels:.15,waterDim:.25,hazeLo:.05,hazeHi:.3,hazeChroma:2,deepLo:.35,deepHi:.8,objChroma:.045,neutralDesat:.8,neutralLo:.025,neutralHi:.05,neutralLLo:.65,neutralLHi:.8,warmHue:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:70*Math.PI/180,warmLo:.006,warmHi:.015,warmHaze:.06,brightLo:.6,brightHi:.8,keepLo:.09,keepHi:.14,targetHue:252*Math.PI/180,c0:0,c1:.11,darkLo:.08,darkHi:.45,darkHaze:.6,farLo:50*Math.PI/180,farHi:110*Math.PI/180,farKeep:.55,mix:.8},_t={target:242*Math.PI/180,pull:.6,bandLo0:130*Math.PI/180,bandLo1:225*Math.PI/180,bandHi0:255*Math.PI/180,bandHi1:305*Math.PI/180,violetCLo:.08,violetCHi:.14,greenShift:22*Math.PI/180,greenLo0:85*Math.PI/180,greenLo1:125*Math.PI/180,greenTop0:205*Math.PI/180,greenTop1:240*Math.PI/180,cLo:0,cHi:.1,lLo:.15,lHi:.4,chroma:.1,dark:.2,darkGreen:.1,darkLLo:.3,darkLHi:.6,darkCLo:.015,darkCHi:.16,blackK:.1,blackLo:0,blackHi:.25,shadowC0:.006,shadowC1:.1,shadowLLo:.15,shadowLHi:.6,shadowKeep:.5,shadowFadeLo:.35,shadowFadeHi:.55,liftLLo:.9,liftNeutralC:.04,lift:.08,hiDesat:.45,warmC:.006,warmHue:80*Math.PI/180},vt={target:258*Math.PI/180,mix:.9,warmDir:45*Math.PI/180,sLo:-.05,sHi:.03,vcLo:.07,vcHi:.12,vio0:285*Math.PI/180,vio1:310*Math.PI/180,vio2:345*Math.PI/180,vegIn0:60*Math.PI/180,vegIn1:80*Math.PI/180,vegOut0:150*Math.PI/180,vegOut1:195*Math.PI/180,vegCLo:.02,vegCHi:.04,vegGreen:.8,cK:.24,cMax:.12,hiLo:.55,hiHi:.85,hiDrop:.3,neutralLLo:.35,neutralLHi:.6,neutralCLo:.015,neutralCHi:.05,neutralK:.8,warmHue:62*Math.PI/180,warmIn0:30*Math.PI/180,warmIn1:50*Math.PI/180,warmOut0:82*Math.PI/180,warmOut1:105*Math.PI/180,warmCLo:.015,warmCHi:.045,warmLLo:.2,warmLHi:.4,warmPull:.5,warmGain:.35,warmCMax:.15,shadowK:.25,shadowHi:.4,farLo:50*Math.PI/180,farHi:80*Math.PI/180,farMin0:105*Math.PI/180,farMin1:140*Math.PI/180,farCLo:.02,farCHi:.05,farBoost:.43},yt={hue:355*Math.PI/180,bandIn:30*Math.PI/180,bandOut:55*Math.PI/180,lLo:.86,lHi:.96,cLo:.04,cHi:.08,mix:.85},bt={calmLo:.15,calmHi:.6,veilLLo:.27,veilLHi:.38,liftLo:.08,liftHi:.25,veilCLo:.06,veilCHi:.11,rovKeep:.25};function xt(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function St(e,t,n){let r=bt,i=xt(r.veilLLo,r.veilLHi,e),a=xt(r.liftLo,r.liftHi,n)*(1-xt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}function Ct(e,t){return Math.min(1,Math.max(0,t.vivid??0))*It(e)*Math.min(1,Math.max(0,e.vividGate??1))}const wt={sunLo:-.15,sunHi:-.3};function Tt(e,t,n){let r=bt,i=Math.max(xt(r.veilLLo,r.veilLHi,e),xt(-wt.sunLo,-wt.sunHi,-n)),a=xt(r.liftLo,r.liftHi,n)*(1-xt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}const Et={lo:.1,hi:.45};function Dt(e,t){let n=Math.max(0,e);return t>1&&n>0?n**(1+(t-1)*xt(Et.lo,Et.hi,n)):n}const Ot={amount:.7,calmLo:.05,calmHi:.3},kt={gain:.5,top:.15,warmGain:.5,warmTop:.12,warmIn0:10*Math.PI/180,warmIn1:45*Math.PI/180,warmOut0:80*Math.PI/180,warmOut1:115*Math.PI/180,magIn0:285*Math.PI/180,magIn1:320*Math.PI/180,magOut0:330*Math.PI/180,magOut1:360*Math.PI/180,cLo:.01,cHi:.07,lLo:.1,lHi:.3,hiLo:.85,hiHi:.97,coolCut:.6,coolIn0:165*Math.PI/180,coolIn1:215*Math.PI/180},At={max:4,wbMin:.25,wbMax:5,waterPow:.6,waterMax:3};function jt(e){let t=e.wbTap;if(!t||!(t[0]>0)||!(t[1]>0)||!Number.isFinite(t[0])||!Number.isFinite(t[1]))return null;let n=e=>Math.min(At.max,Math.max(1/At.max,e)),r=n(t[0]),i=n(t[1]);return r===1&&i===1?null:[r,i]}function Mt(e,t){let n=jt(t);if(!n)return e;let r=[n[0],1,n[1]],i=e.wb.map((e,t)=>t===1?e:Math.min(At.wbMax,Math.max(At.wbMin,e*r[t]))),a=e.waterWb.map((e,t)=>t===1?e:Math.min(At.waterMax,Math.max(1/At.waterMax,e*r[t]**+At.waterPow)));return{...e,wb:i,waterWb:a}}const Nt={teal:35*Math.PI/180,blue:14*Math.PI/180};function Pt(e){let t=Math.min(1,Math.max(-1,e.waterHue??0));return Number.isFinite(t)?t*(t<0?Nt.teal:Nt.blue):0}function Ft(e,t){let n=e=>Math.min(1,Math.max(0,e)),r=n(Math.max(e.calm??0,e.calmTone??0));return Math.max(n(t.blue??0),Ot.amount*n(t.vivid??0))*It(e)*(1-xt(Ot.calmLo,Ot.calmHi,r))*n(e.blueGate??e.vividGate??1)}function It(e){let t=Math.min(1,Math.max(0,Math.max(e.calm??0,e.calmTone??0)));return 1-xt(bt.calmLo,bt.calmHi,t)}function Lt(e){return Math.min(1,Math.max(0,e.intensity-1))}function Rt(e){let t=Lt(e);return{strength:Math.min(1,Math.max(0,e.intensity)),saturation:e.saturation+.35*t,clarity:Math.min(1,e.clarity+.5*t),veil:e.veil+.3*t,look:Math.min(1,Math.max(0,e.look)),dehaze:.6*t,hazeLift:0,subjectPop:!!e.subjectPop,subjectPopStrength:e.subjectPopStrength,subjectPopWarmth:e.subjectPopWarmth}}function zt(e){let t=Math.min(1,Math.max(0,(e.haze-K.deepLo)/(K.deepHi-K.deepLo)));return t*t*(3-2*t)}function Bt(e){return Vt(e.haze)}function Vt(e){let t=Math.min(1,Math.max(0,(e-K.hazeLo)/(K.hazeHi-K.hazeLo)));return t*t*(3-2*t)}function Ht(e,t){let n=rt[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=[Math.min(n.redMax,Math.max(1,e.wb[0]*n.red)),1,Math.min(1.6,Math.max(.5,e.wb[2]*n.blue))],i=[Math.min(2,r[0]**.6),1,Math.min(2,Math.max(.5,r[2]**.6))];return{...e,wb:r,waterWb:i,exposure:e.exposure*n.exposure}}function Ut(e,t){let n=rt[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=t.preset===`reef`?Math.min(e.dehaze,.15):Math.min(1,Math.max(e.dehaze,n.dehaze));return{...e,dehaze:r,clarity:Math.min(1,Math.max(0,e.clarity+n.clarity)),hazeLift:Math.max(e.hazeLift,n.hazeLift)}}function Wt(e,t){let n=Math.min(1,Math.max(0,t.look));if(n<=0)return e;let r=Bt(e)*n,i=t.hazeAuto===!1?0:Gt.lift*Bt(e)*e.hazeBlack,a=K.liftRelief*Math.min(1,i/K.liftRef);return{...e,exposure:e.exposure*(1-K.dim*r*(1-a)),levelsMix:Math.min(.85,e.levelsMix+K.hazeLevels*r)}}const Gt={dehaze:.5,clarity:0,levels:.15,lift:.8};function Kt(e,t){let n=Bt(t);return n<=0?e:{...e,dehaze:Math.max(e.dehaze,Gt.dehaze*n),clarity:Math.min(1,e.clarity+Gt.clarity*n),hazeLift:Math.max(e.hazeLift,Gt.lift*n)}}function qt(e){let t=Bt(e);return t<=0?e:{...e,levelsMix:Math.min(.85,e.levelsMix+Gt.levels*t)}}function Jt(e,t){let n=e.look;if(n<=0)return e;let r=Bt(t)*n;return{...e,dehaze:Math.max(e.dehaze,K.hazeDehaze*r),clarity:Math.min(1,e.clarity+K.hazeClarity*r)}}function Yt(e,t){if(t<=0)return e;let n=1+.8*t,r=e.wb.map(e=>Math.min(5,Math.max(.25,e**+n))),i=1.6+1.4*t,a=.6+.3*t,o=r.map(e=>Math.min(i,Math.max(1/i,e**+a)));return{...e,wb:r,waterWb:o,attn:e.attn.map(e=>e*n),gainCap:e.gainCap+t,levelsMix:Math.min(.85,e.levelsMix+.3*t),chromaK:e.chromaK+t}}const q={hue:45*Math.PI/180,bandHue:65*Math.PI/180,bandIn:50*Math.PI/180,bandOut:75*Math.PI/180,achroma:.012,lLo:.4,lHi:.55,cLo:.07,cHi:.1,mix:1,wLo:.1,wHi:.5,cMin:.05};function Xt(e){return new Float32Array(e.fields)}function J(e){let t=new Float32Array(e.width*e.height*4);for(let n=0;n<e.width*e.height;n++)t[n*4]=e.guide[n*3],t[n*4+1]=e.guide[n*3+1],t[n*4+2]=e.guide[n*3+2],t[n*4+3]=e.person?e.person[n]:0;return t}function Zt(e){let t=e.tilesX*e.tilesY*e.bins,n=new Float32Array(t*4);for(let r=0;r<t;r++)n[r*4]=e.data[r];return n}const Qt=1.1,$t=.12,en=.3,tn=2.2,nn=.1,rn=.4,an=10*Math.PI/180,on=26*Math.PI/180,sn=.025,cn=60*Math.PI/180,ln=110*Math.PI/180,un=30*Math.PI/180,dn=60*Math.PI/180,fn=.8,pn=1.6,mn=3.5,hn=.55,gn=1.5,_n={strength:1,bMin:.8,objLo:0,objHi:0},vn=.14,yn=.86,bn=.5,xn={target:.4,strength:.7,max:1.5},Sn={clip:2,sigLo:.03,sigHi:.1,anchor:1},Cn=.75,wn=.05,Tn={covLo:.3,covHi:.7,clearLo:.7,clearHi:.85,sig:.8,lift:.7},En=.55,Dn=.5,On=.12,kn={low:.75,mid:.5},An=new Map;function Y(e,t){let n=An.get(e);return(!n||n.length!==t)&&(n=new Float32Array(t),An.set(e,n)),n}const jn=4096,Mn=new Float32Array(jn+1);for(let e=0;e<=jn;e++)Mn[e]=w(e/jn);function Nn(e){if(e<=0)return 0;if(e>=1)return 1;let t=e*jn,n=t|0,r=t-n;return Mn[n]+(Mn[n+1]-Mn[n])*r}function Pn(e,t,r,i={}){let a=t*r,o=Y(`lin`,a*3),s=Y(`d`,a),l=0,u=0,d=0;for(let t=0;t<a;t++){let n=e[t*4],r=e[t*4+1],i=e[t*4+2];o[t*3]=ee[n],o[t*3+1]=ee[r],o[t*3+2]=ee[i];let a=n/255,c=r/255,f=i/255;s[t]=nt.mu0+nt.mu1*Math.max(c,f)+nt.mu2*a,l+=a,u+=c,d+=f}let f=[l/a,u/a,d/a],p=Qn(Qn(s,t,r,2,Y(`blurA`,a),Y(`blurT`,a)),t,r,2,Y(`blurB`,a),Y(`blurT`,a)),[h,g]=Xn(p,[.02,.98]),_=Math.max(.02,g-h),v=Y(`z`,a);for(let e=0;e<a;e++)v[e]=Vn((p[e]-h)/_);let y=[],x=[[],[],[]],S=Y(`lum`,a),C=new Uint8Array(a),w=new Uint32Array(10),T=new Uint32Array(1280);for(let e=0;e<a;e++){S[e]=Bn(o,e);let t=Math.min(9,v[e]*10|0);C[e]=t,w[t]++,T[t*128+Math.min(127,Math.sqrt(S[e])*128|0)]++}let E=new Float32Array(10);for(let e=0;e<10;e++){if(w[e]<24){E[e]=-1;continue}let t=Math.max(6,Math.round(w[e]*.015)),n=0,r=0;for(;r<128&&(n+=T[e*128+r],!(n>=t));r++);let i=(r+1)/128;E[e]=i*i}for(let e=0;e<a;e++){let t=E[C[e]];t<0||S[e]>t||(y.push(v[e]),x[0].push(o[e*3]),x[1].push(o[e*3+1]),x[2].push(o[e*3+2]))}let O=[0,0,0];{let[e]=Xn(v,[.98]),t=0;for(let n=0;n<a;n++)v[n]<e||(O[0]+=o[n*3],O[1]+=o[n*3+1],O[2]+=o[n*3+2],t++);t>0?(O[0]/=t,O[1]/=t,O[2]/=t):(O[0]=f[0],O[1]=f[1],O[2]=f[2])}let[,te,ne]=D(O[0],O[1],O[2]),re=Math.hypot(te,ne)||1,ie=[te/re,ne/re],k=[0,0,0],ae=[0,0,0],A=[0,0,0];{let e=Yn(y,x);for(let t=0;t<3;t++)k[t]=e[t].A,ae[t]=e[t].beta,A[t]=e[t].c}let oe=[k[0],k[1],k[2]],se=0;for(let e=0;e<a;e++)se+=v[e];let j=se/a,ce=Y(`hueObj`,a),le=Y(`hueFar`,a),ue=Y(`chroma`,a),de=Y(`veilCos`,a),fe=Y(`okL`,a),pe=Y(`okA`,a),ge=Y(`okB`,a),_e=Y(`bdWater`,a);for(let e=0;e<a;e++){let[t,n,r]=D(o[e*3],o[e*3+1],o[e*3+2]);fe[e]=t,pe[e]=n,ge[e]=r,_e[e]=1-Wn(n,r,ie,un,dn,sn);let i=Math.hypot(n,r);ue[e]=i,de[e]=i>1e-6?(n*ie[0]+r*ie[1])/i:1,ce[e]=Un(n,r,ie,an,on,sn),le[e]=Wn(n,r,ie,cn,ln,sn)}let M=Y(`bf`,a*3);for(let e=0;e<a;e++){let t=v[e];M[e*3]=k[0]*(1-Math.exp(-(ae[0]*t+A[0]))),M[e*3+1]=k[1]*(1-Math.exp(-(ae[1]*t+A[1]))),M[e*3+2]=k[2]*(1-Math.exp(-(ae[2]*t+A[2])))}let ve=Y(`backdrop`,a),P=new Float32Array(18),xe=Y(`bdDev`,a),Se=X(c.blueLo,c.blueHi,O[2]/Math.max(1e-4,O[1])),Ce=Se>0?m(fe,pe,ge,_e,t,r,ve,P,xe)*Se:0;if(Se<=0)ve.fill(0,0,a);else if(Se<1)for(let e=0;e<a;e++)ve[e]*=Se;let we=Y(`objHue`,a);for(let e=0;e<a;e++)we[e]=Math.max(ce[e]*(1-Ce*(1-xe[e])),ve[e]);let Te=Hn(o,we,M,t,r,Y(`veilScale`,a)),Ee=ye(k,O)*N.greenObj,De=N.litSub*be(k,O),Oe=.2+De,ke=.55+De,Ae=Y(`J`,a*3),je=Y(`conf`,a),Me=Y(`wbWeight`,a),Ne=Y(`sigArr`,a),Pe=()=>{for(let e=0;e<a;e++){let t=Math.max(1e-5,S[e]),n=Math.min(1,Te[e]),r=0,i=0,a=[0,0,0];for(let t=0;t<3;t++){let o=M[e*3+t];a[t]=n*o;let s=t===0?.2126:t===1?.7152:.0722;r+=Te[e]*o*s,i+=a[t]*s}let s=Math.max(0,(t-r)/t);Ne[e]=s;let c=X(Oe,ke,s)*(1-le[e]),l=Math.max(wn,1-i/t);for(let t=0;t<3;t++){let n=o[e*3+t],r=Math.max(n-a[t],n*wn);Ae[e*3+t]=n*l+(r-n*l)*c}let u=X(nn,rn,s),d=X(at.lo,at.hi,s)*(1-Ce+ve[e]);je[e]=Math.min(u,Math.max(we[e],d,Ee)),Me[e]=Math.sqrt(u)}};Pe();let Fe=0;{let e=0;for(let t=0;t<a;t++)e+=je[t];let[n,i]=Xn(Ne,[.5,.95]),s=X(Tn.covLo,Tn.covHi,e/a)*(1-X(Tn.clearLo,Tn.clearHi,i));Fe=s;let c=1+(Math.min(1,(1-Tn.sig)/Math.max(.001,1-n))-1)*s;if(c<.98){for(let e=0;e<3;e++)k[e]*=c;for(let e=0;e<a*3;e++)M[e]*=c;Te=Hn(o,we,M,t,r,Te),Pe()}}let Ie=0,Le=0,Re=0,ze=0;for(let e=0;e<a;e++){let t=Me[e];if(t<=0)continue;let n=Ae[e*3],r=Ae[e*3+1],i=Ae[e*3+2],a=n*n,o=r*r,s=i*i;Ie+=t*a*a*a,Le+=t*o*o*o,Re+=t*s*s*s,ze+=t}let F=[1,1,1],Be=ye(k,O);if(ze>0){let e=(Ie/ze)**(1/6)+1e-5,t=(Le/ze)**(1/6)+1e-5,n=(Re/ze)**(1/6)+1e-5;F[0]=Math.min(mn+(N.greenRMax-mn)*Be,Math.max(1,t/e));let r=Math.min(gn+(N.greenBMax-gn)*Be,Math.max(1,k[1]/Math.max(1e-4,k[2])));F[2]=Math.min(r,Math.max(hn,t/n))}let Ve=X(.01,.06,ze/a);F[0]=1+(F[0]-1)*Ve,F[2]=1+(F[2]-1)*Ve;let I=(e,t)=>{let n=Math.min(1.15,Math.max(0,v[e]+Math.min(.25,Math.max(-.25,Dn*(s[e]-p[e])/_)))),r=Math.max(1e-5,S[e]),i=0,a=0,c=[0,0,0];for(let t=0;t<3;t++){let r=it.veil*k[t]*(1-Math.exp(-(ae[t]*n+A[t]))),o=t===0?.2126:t===1?.7152:.0722;c[t]=Math.min(1,Te[e])*r,i+=Te[e]*r*o,a+=c[t]*o}let l=X(Oe,ke,Math.max(0,(r-i)/r))*(1-le[e]),u=Math.max(wn,1-a/r);for(let n=0;n<3;n++){let r=o[e*3+n],i=Math.max(r-c[n],r*wn);t[n]=r*u+(i-r*u)*l}return n};Be>0&&(F[0]*=1+(N.greenWarmR-1)*Be,F[2]*=1+(N.greenWarmB-1)*Be);let He=new Uint8Array(a),Ue=zn(I,je,ce,ue,de,S,t,r,He);if(Ue.weight>0){let e=k[1]/Math.max(1e-4,k[2]),t=e>1?Math.min(Rn,e*e):1,n=1/Math.max(.5,1+Qt*X($t,en,g-h)*(Ue.z-j)),r=Math.min(mn,Math.max(1,(Ue.mean[1]/Math.max(1e-5,Ue.mean[0]))**+n)),i=Math.min(t,Math.max(hn,(Ln*Ue.mean[1]/Math.max(1e-5,Ue.mean[2]))**+n)),a=(e,t)=>Math.exp(Math.log(e)+(Math.log(t)-Math.log(e))*Ue.weight);F[0]=a(F[0],r),F[2]=a(F[2],i)}for(let e=0;e<6&&!(Kn(Ae,Me,a,F)<=.015);e++)F[0]=Math.max(1,F[0]*.9);{let e=0;for(let t=0;t<a;t++)e+=je[t];let t=_n.strength*(_n.objHi>0?X(_n.objLo,_n.objHi,e/a):1);F[0]**=+t,F[2]=Math.max(Math.min(1,_n.bMin),F[2]**+t)}let We=X($t,en,g-h),Ge=[Qt*We*Math.log(F[0]),0,Qt*We*Math.log(F[2])];for(let e=0;e<a;e++){let t=v[e]-j;for(let n=0;n<3;n++)Ae[e*3+n]*=Math.min(tn,Math.max(1/tn,Math.exp(Ge[n]*t)))}let Ke=e=>Math.min(pn,Math.max(1/pn,e**.6)),L=[Ke(F[0]),1,Ke(F[2])];if(L[2]<1&&(L[2]+=(1-L[2])*Ce*X(1,1.25,k[2]/Math.max(1e-4,k[1]))),Be>0)for(let e of[0,2])L[e]=Math.exp(Math.log(L[e])+(Math.log(F[e])-Math.log(L[e]))*Be*N.greenWater);let qe=Y(`waterLin`,a*3);for(let e=0;e<a;e++){je[e];for(let t=0;t<3;t++)Ae[e*3+t]=Ae[e*3+t]*F[t],qe[e*3+t]=o[e*3+t]*L[t]}let Je=Y(`Y`,a),Ye=(e,t,n)=>{let r=je[e],i=e*3,a=qe[i]*n,o=qe[i+1]*n,s=qe[i+2]*n,c=(a+(Ae[i]*t-a)*r)*.2126;return c+=(o+(Ae[i+1]*t-o)*r)*.7152,c+=(s+(Ae[i+2]*t-s)*r)*.0722,c=Math.max(c,Gn(S[e])*S[e]*n),c>Cn?Cn+(1-Cn)*(1-Math.exp(-(c-Cn)/(1-Cn))):c},Xe=0,Ze=0,Qe=0;for(let e=0;e<a;e++){let t=Ye(e,1,1);Xe+=je[e]*Math.log(1e-4+t),Ze+=je[e],Qe+=je[e]}let R=X(.02,.15,Qe/a),$e=Ze>1e-6?Math.exp(Xe/Ze):vn,z=Math.min(1.35,Math.max(.75,vn/Math.max(1e-4,$e)));z=1+(z-1)*R;{let e=z**+fn;for(let t=0;t<a;t++)Je[t]=Ye(t,z,e)}let[B]=Xn(Je,[.995]);if(B>yn){z=Math.max(.6,yn/B*z);let e=z**+fn;for(let t=0;t<a;t++)Je[t]=Ye(t,z,e)}let[et,tt,rt]=Xn(Je,[.004,.1,.5]),ot=Math.min(et,kn.low*tt,kn.mid*rt)*(1-Tn.lift*Fe),st=[0,0,0];{let e=z**+fn,t=Y(`hazeCh`,a);for(let n=0;n<3;n++){for(let r=0;r<a;r++){let i=qe[r*3+n]*e;t[r]=i+(Ae[r*3+n]*z-i)*je[r]}st[n]=Xn(t,[.004])[0]}}if(ot<et)for(let e=0;e<3;e++)st[e]*=ot/et;{let e=Gt.lift*Vt(Vn(et/On))*ot;if(e>0)for(let t=0;t<a;t++)Je[t]*=ut(Je[t],e)}let[ct,lt]=Xn(Je,[.004,.996]),dt=Math.min(ct,.015),ft=Math.min(1,Math.max(lt,dt+.2,.65)),pt=Y(`enc`,a);for(let e=0;e<a;e++){let t=Je[e];pt[e]=Nn(Vn(t+((t-dt)/(ft-dt)-t)*bn))}let H=tr(pt,t,r),U=1;if(xn.strength>0){let e=Math.cbrt(Math.max(1e-4,ee[Math.round(255*Vn(Xn(pt,[.5])[0]))]));e>xn.target&&e<.98&&(U=1+(Math.min(xn.max,Math.log(xn.target)/Math.log(e))-1)*xn.strength)}let W=je,mt=0,G,ht;if(Ce>0){let e=Y(`subjMap`,a),o=Y(`notAnimal`,a);o.fill(0,0,a),mt=b(ve,xe,Ce,t,r,e,fe,P,_e,i.seeds,pe,ge,o,ht=[]),W=Y(`confMap`,a);for(let t=0;t<a;t++)W[t]=je[t]+(e[t]-je[t])*Ce;G=n(e,xe,t,r,160,90,o)}let gt=er(v,W,p,Te,o,t,r);G&&(gt.animals=G),ht&&(gt.blobs=ht);let K=Vn(et/On),_t=me(o,a),{calm:vt,calmTone:yt}=he(_t,K),bt=0,xt=0,Ct=0,wt=0;for(let e=0;e<r;e++){let n=e<r/3?1:e>=2*r/3?2:0;if(n)for(let r=0;r<t;r++){let i=fe[e*t+r];i<.02||(n===1?(bt+=i,xt++):(Ct+=i,wt++))}}let Et=D(oe[0],oe[1],oe[2]),Dt=xt>0&&wt>0?Ct/wt-bt/xt:0,Ot=St(Et[0],Math.hypot(Et[1],Et[2]),Dt),kt=Tt(Et[0],Math.hypot(Et[1],Et[2]),Dt),At=0,jt=1,Mt=0;{let e=Float32Array.from(fe).sort();At=e[Math.floor(.25*(a-1))],jt=e[Math.floor(.97*(a-1))];let t=e[Math.floor(.8*(a-1))],n=0,r=0;for(let e=0;e<a;e++)fe[e]>=t&&(n+=o[e*3],r+=o[e*3+1]);Mt=1-X(V.redLo,V.redHi,n/Math.max(1e-5,r));let i=xt>0&&wt>0?Ct/wt-bt/xt:0;Mt*=X(V.bandLo,V.bandHi,i)}let Nt=Zn(fe,t,r,At,jt);return{params:{toneGamma:U,seabedNeed:Mt,seabedLw:At,seabedLb:jt,seabedGrid:Nt,binf:k,betaB:ae,cB:A,attn:Ge,gainCap:tn,zMean:j,wb:F,waterWb:L,confLo:nn,confHi:rn,veilColor:O,cosLo:an,cosHi:on,hueFarLo:cn,hueFarHi:ln,haze:K,hazeBlack:ot,frameBlack:ot,hazeFloor:st,achroma:sn,waterExposure:fn,exposure:z,black:dt,white:ft,levelsMix:bn,chromaK:2.6,chromaC0:.025,zLo:h,zHi:g,depthGuide:Dn,floorFrac:wn,shadowFloor:En,knee:Cn,subLo:Oe,subHi:ke,calm:vt,calmTone:yt,backdrop:Ce,backdropFit:Array.from(P),subjectTone:mt,vividGate:Ot,blueGate:kt},depth:gt,clahe:H,mean:f,diag:{sandWeight:Ue.weight,sandFrac:Ue.frac,sandMask:He,calm:_t,backdrop:Ce,tone:{black:et,yLow:tt,yMid:rt,veilCap:Fe}}}}const Fn=75*Math.PI/180,In=Math.cos(Fn),Ln=.94,Rn=1.8;function zn(e,t,n,r,i,a,o,s,c){let l=o*s,u=Y(`sandSq`,l);for(let e=0;e<l;e++)u[e]=a[e]*a[e];let d=Qn(a,o,s,2,Y(`sandM`,l),Y(`blurT`,l)),f=Qn(u,o,s,2,Y(`sandS`,l),Y(`blurT`,l)),p=Y(`sandCand`,l),m=0;for(let e=0;e<l;e++){if(p[e]=-1,t[e]<.5||n[e]<.3||a[e]<.12)continue;let o=Math.sqrt(Math.max(0,f[e]-d[e]*d[e]));if(o>.22*d[e]||o<.045*d[e])continue;let s=r[e];s>.13||s>.03&&i[e]<In||(p[e]=a[e],m++)}let h=m/l,g=.95*X(.05,.15,h),_=[0,0,0];if(g<=0)return{weight:0,frac:h,mean:_,z:0};let[v]=Xn(p,[1-.30000000000000004*h]),y=0,b=[0,0,0],x=0;for(let t=0;t<l;t++)p[t]<v||(x+=e(t,b),_[0]+=b[0],_[1]+=b[1],_[2]+=b[2],y++);if(y===0)return{weight:0,frac:h,mean:_,z:0};_[0]/=y,_[1]/=y,_[2]/=y;for(let e=0;e<l;e++)c[e]=+(p[e]>=v);return{weight:g,frac:h,mean:_,z:x/y}}function Bn(e,t){return T(e[t*3],e[t*3+1],e[t*3+2])}function Vn(e){return e<0?0:e>1?1:e}function Hn(e,t,n,r,i,a){let o=Array.from({length:144},()=>[]);for(let a=0;a<i;a++){let s=Math.min(8,Math.floor(a*9/i));for(let i=0;i<r;i++){let c=a*r+i;if(t[c]>.5)continue;let l=n[c*3]*.2126;if(l+=n[c*3+1]*.7152,l+=n[c*3+2]*.0722,l<.001)continue;let u=T(e[c*3],e[c*3+1],e[c*3+2]),d=Math.min(15,Math.floor(i*16/r));o[s*16+d].push(u/l)}}let s=new Float32Array(144).fill(NaN);for(let e=0;e<144;e++){let t=o[e];t.length<6||(t.sort((e,t)=>e-t),s[e]=Math.min(2.2,Math.max(.6,t[t.length>>1])))}for(let e=0;e<8;e++){let e=!1,t=new Float32Array(s);for(let n=0;n<9;n++)for(let r=0;r<16;r++){let i=n*16+r;if(!Number.isNaN(s[i]))continue;let a=0,o=0;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++){let i=r+t,c=n+e;if(i<0||c<0||i>=16||c>=9)continue;let l=s[c*16+i];Number.isNaN(l)||(a+=l,o++)}o>0&&(t[i]=a/o,e=!0)}if(s.set(t),!e)break}for(let e=0;e<144;e++)Number.isNaN(s[e])&&(s[e]=1);for(let e=0;e<i;e++){let t=Math.min(Math.max((e+.5)*9/i-.5,0),8),n=Math.floor(t),o=Math.min(n+1,8),c=t-n;for(let t=0;t<r;t++){let i=Math.min(Math.max((t+.5)*16/r-.5,0),15),l=Math.floor(i),u=Math.min(l+1,15),d=i-l,f=s[n*16+l]*(1-d)+s[n*16+u]*d,p=s[o*16+l]*(1-d)+s[o*16+u]*d;a[e*r+t]=f*(1-c)+p*c}}return a}function Un(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 1;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o)),c=X(r,i,Math.acos(s)),l=X(a,a*2,o);return c+(1-c)*(1-l)}function Wn(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 0;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o));return X(r,i,Math.acos(s))*X(a,a*2,o)}function X(e,t,n){let r=Vn((n-e)/(t-e));return r*r*(3-2*r)}function Gn(e,t=En){return .97+(t-.97)*X(.02,.15,e)}function Kn(e,t,n,r){let i=0,a=0;for(let o=0;o<n;o+=2){if(t[o]<.5)continue;let[n,s,c]=D(e[o*3]*r[0],e[o*3+1]*r[1],e[o*3+2]*r[2]);if(n<.25||n>.9||Math.hypot(s,c)<.06)continue;i++;let l=te(s,c);l>300&&l<348&&a++}return i<20?0:a/i}const qn=[.3,.45,.65,.9,1.3,1.8,2.5,3.5,5,7],Jn=[0,.1,.2,.35,.5,.7,1,1.5];function Yn(e,t){let n=[{A:0,beta:1,c:0},{A:0,beta:1,c:0},{A:0,beta:1,c:0}];if(e.length<12)return n;let r=Math.max(1,Math.ceil(e.length/400)),i=[],a=[[],[],[]];for(let n=0;n<e.length;n+=r){i.push(e[n]);for(let e=0;e<3;e++)a[e].push(t[e][n])}let o=i.length,s=new Float32Array(o),c=[{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0}];for(let e of qn)for(let t of Jn){let n=0;for(let r=0;r<o;r++){let a=1-Math.exp(-(e*i[r]+t));s[r]=a,n+=a*a}let r=1+.05*t;for(let i=0;i<3;i++){let l=a[i],u=0,d=0;for(let e=0;e<o;e++)u+=s[e]*l[e],d+=l[e]*l[e];let f=n>1e-9?Math.min(1,Math.max(0,u/n)):0,p=(f*f*n-2*f*u+d)*r;p<c[i].err&&(c[i]={A:f,beta:e,c:t,err:p})}}let l=(e,t)=>e.A*(1-Math.exp(-(e.beta*t+e.c))),u=1;for(let e of[.1,.3,.6,1]){let t=l(c[0],e),n=.85*Math.min(l(c[1],e),l(c[2],e));t>n&&(u=Math.min(u,t>1e-6?n/t:0))}return c[0].A*=Math.max(0,u),c.map(e=>({A:e.A,beta:e.beta,c:e.c}))}function Xn(e,t){let n=1/0,r=-1/0;for(let t=0;t<e.length;t++){let i=e[t];i<n&&(n=i),i>r&&(r=i)}if(!(r>n))return t.map(()=>n);let i=2048,a=new Uint32Array(i),o=(i-1)/(r-n);for(let t=0;t<e.length;t++)a[(e[t]-n)*o|0]++;let s=[];for(let r of t){let t=r*e.length,c=0,l=0;for(;l<i&&(c+=a[l],!(c>=t));l++);s.push(n+Math.min(l,i-1)/o)}return s}function Zn(e,t,n,r,i){let a=V.grid,o=Array(a*a).fill(0),s=Array(a*a).fill(0),c=Math.max(i,r+.05),l=r+V.lo*(c-r),u=r+(V.lo+V.span)*(c-r);for(let r=0;r<n;r++){let i=Math.min(a-1,Math.floor(r*a/n));for(let n=0;n<t;n++){let c=i*a+Math.min(a-1,Math.floor(n*a/t));o[c]+=X(l,u,e[r*t+n]),s[c]++}}return o.map((e,t)=>s[t]>0?e/s[t]:0)}function Qn(e,t,n,r,i=new Float32Array(t*n),a=new Float32Array(t*n)){let o=2*r+1;for(let i=0;i<n;i++){let n=0;for(let a=-r;a<=r;a++)n+=e[i*t+$n(a,t)];for(let s=0;s<t;s++)a[i*t+s]=n/o,n+=e[i*t+$n(s+r+1,t)]-e[i*t+$n(s-r,t)]}for(let e=0;e<t;e++){let s=0;for(let i=-r;i<=r;i++)s+=a[$n(i,n)*t+e];for(let c=0;c<n;c++)i[c*t+e]=s/o,s+=a[$n(c+r+1,n)*t+e]-a[$n(c-r,n)*t+e]}return i}function $n(e,t){return e<0?0:e>=t?t-1:e}function er(e,t,n,r,i,a,o){let s=Qn(e,a,o,1),c=Qn(Qn(t,a,o,1),a,o,1),l=new Float32Array(14400*4),u=new Float32Array(14400*3);for(let e=0;e<90;e++){let t=Math.floor(e*o/90),d=Math.max(t+1,Math.floor((e+1)*o/90));for(let o=0;o<160;o++){let f=Math.floor(o*a/160),p=Math.max(f+1,Math.floor((o+1)*a/160)),m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;for(let e=t;e<d;e++)for(let t=f;t<p;t++){let o=e*a+t;m+=s[o],h+=c[o],g+=n[o],_+=r[o],v+=i[o*3],y+=i[o*3+1],b+=i[o*3+2],x++}let S=e*160+o;l[S*4]=m/x,l[S*4+1]=h/x,l[S*4+2]=g/x,l[S*4+3]=_/x,u[S*3]=v/x,u[S*3+1]=y/x,u[S*3+2]=b/x}}return{width:160,height:90,fields:l,guide:u}}function tr(e,t,n){let r=new Float32Array(1536),i=new Float32Array(32);for(let a=0;a<6;a++){let o=Math.floor(a*n/6),s=Math.floor((a+1)*n/6);for(let n=0;n<8;n++){let c=Math.floor(n*t/8),l=Math.floor((n+1)*t/8);i.fill(0);let u=0,d=0,f=0;for(let n=o;n<s;n++)for(let r=c;r<l;r++){let a=e[n*t+r];i[Math.min(31,a*32|0)]++,d+=a,f+=a*a,u++}let p=.5;for(let e=0,t=0;e<32;e++){if(t+i[e]>=u/2&&i[e]>0){p=(e+(u/2-t)/i[e])/32;break}t+=i[e]}let m=Sn.clip*u/32,h=0;for(let e=0;e<32;e++)i[e]>m&&(h+=i[e]-m,i[e]=m);let g=h/32,_=(a*8+n)*32;if(u===0){for(let e=0;e<32;e++)r[_+e]=(e+1)/32;continue}let v=d/u,y=X(Sn.sigLo,Sn.sigHi,Math.sqrt(Math.max(0,f/u-v*v))),b=0,x=p;{let e=Math.min(31,p*32|0),t=0;for(let n=0;n<e;n++)t+=i[n]+g;x=(t+(i[e]+g)*(p*32-e))/u}let S=Sn.anchor*(x-p);for(let e=0;e<32;e++){b+=i[e]+g;let t=(e+1)/32;r[_+e]=Vn(t+y*(b/u-t-S))}}}return{tilesX:8,tilesY:6,bins:32,data:r}}const Z={popLo:.2,popHi:.6,alphaR:6,rampIn:2.5,trustLo:2,trustHi:4.5,evLo:.025,evHi:.07,evFar:.4,rampEv:1,thinLevels:4,jbuK:.5,jbuNoise:.02,jbuLo:.46,jbuHi:.72};function nr(e,t,n){let r=Math.min(n,...t),i=Math.max(n,...t),a=1/Math.max(Z.jbuNoise,Z.jbuK*(i-r));return e.map((e,r)=>e*Math.exp(-(((t[r]-n)*a)**2)))}const rr=`
const float CONF_BRIGHT_LO = ${at.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${at.hi.toFixed(4)};
const float PERSON_LUM_LO = ${ot.lo.toFixed(4)};
const float PERSON_LUM_HI = ${ot.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${st.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${st.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${ct.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${ct.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${ct.farKeep.toFixed(4)};
const float VIVID_C_LO = ${gt.cLo.toFixed(4)};
const float VIVID_C_HI = ${gt.cHi.toFixed(4)};
const float VIVID_KEEP = ${gt.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${ne.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${re.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${ie.toFixed(4)};
const float LOOK_GAMMA = ${K.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${K.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${K.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${K.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${K.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${K.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${K.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${K.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${K.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${K.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${K.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${K.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${K.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${K.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${K.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${K.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${K.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${K.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${K.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${K.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${K.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${K.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${K.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${K.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${K.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${K.keepHi.toFixed(4)};
const float LOOK_C0 = ${K.c0.toFixed(4)};
const float LOOK_C1 = ${K.c1.toFixed(4)};
const float LOOK_MIX = ${K.mix.toFixed(4)};
const float SKIN_HUE = ${q.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${q.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${q.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${q.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${q.achroma.toFixed(4)};
const float SKIN_L_LO = ${q.lLo.toFixed(4)};
const float SKIN_L_HI = ${q.lHi.toFixed(4)};
const float SKIN_C_LO = ${q.cLo.toFixed(4)};
const float SKIN_C_HI = ${q.cHi.toFixed(4)};
const float SKIN_MIX = ${q.mix.toFixed(4)};
const float SKIN_W_LO = ${q.wLo.toFixed(4)};
const float SKIN_W_HI = ${q.wHi.toFixed(4)};
const float SKIN_C_MIN = ${q.cMin.toFixed(4)};
const float DG_K = ${dt.k.toFixed(4)};
const float DG_EPS = ${dt.eps.toFixed(5)};
const float DG_R_MIN = ${dt.rMin.toFixed(4)};
const float DG_R_MAX = ${dt.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(G.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(G.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(G.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(G.bandIn).toFixed(6)};
const float ON_R_LO = ${G.rLo.toFixed(4)};
const float ON_R_HI = ${G.rHi.toFixed(4)};
const float ON_L_LO = ${G.lLo.toFixed(4)};
const float ON_L_HI = ${G.lHi.toFixed(4)};
const float ON_MIX = ${G.mix.toFixed(4)};
const float ON_FAR_LO = ${G.farLo.toFixed(6)};
const float ON_FAR_HI = ${G.farHi.toFixed(6)};
const float ON_LIFT = ${G.lift.toFixed(4)};
const float ON_SILVER = ${G.silver.toFixed(4)};
const float SC_K = ${pt.k.toFixed(4)};
const float SC_CMAX = ${pt.cMax.toFixed(4)};
const float SC_DESAT = ${pt.desat.toFixed(4)};
const float SC_EDGE = ${pt.edgeFloor.toFixed(4)};
const float SP_VIVID = ${U.vividKeep.toFixed(4)};
const float SP_CLARITY = ${U.clarity.toFixed(4)};
const float SP_LIFT = ${U.lift.toFixed(4)};
const float WP_HUE = ${H.hue.toFixed(4)};
const float SB_HUE = ${V.hue.toFixed(4)};
const float SB_CHROMA = ${V.chroma.toFixed(4)};
const float SB_KEEP = ${V.keep.toFixed(4)};
const float SB_LIFT = ${V.lift.toFixed(4)};
const float SB_GRID = ${V.grid.toFixed(1)};
const float SB_W_LO = ${V.wLo.toFixed(4)};
const float SB_W_HI = ${V.wHi.toFixed(4)};
const float SB_Y0 = ${V.y0.toFixed(4)};
const float SB_Y1 = ${V.y1.toFixed(4)};
const float WP_CMIN = ${H.cMin.toFixed(4)};
const float WP_CMAX = ${H.cMax.toFixed(4)};
const float WP_KEEP = ${H.keep.toFixed(4)};
const float WP_LLO = ${H.lLo.toFixed(4)};
const float WP_LHI = ${H.lHi.toFixed(4)};
const float WP_WLO = ${H.wLo.toFixed(4)};
const float WP_WHI = ${H.wHi.toFixed(4)};
const float WP_SIDE = ${H.side.toFixed(4)};
const float WP_CAST_LO = ${H.castLo.toFixed(4)};
const float WP_CAST_HI = ${H.castHi.toFixed(4)};
const float SP_CHROMA = ${U.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${U.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${U.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${U.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${U.chromaFollowDark.toFixed(4)};
const float SP_DARK_LO = ${U.darkLo.toFixed(4)};
const float SP_DARK_HI = ${U.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(U.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(U.hueMax).toFixed(6)};
const float BD_VETO_LO = ${c.vetoLo.toFixed(4)};
const float BD_VETO_HI = ${c.vetoHi.toFixed(4)};
const float BD_RING_R = ${c.ringR.toFixed(1)};
const float BD_CORE_IN = ${c.coreIn.toFixed(4)};
const float BD_CORE_LO = ${c.coreLo.toFixed(4)};
const float BD_CORE_HI = ${c.coreHi.toFixed(4)};
const float BD_HOLD_LO = ${c.holdLo.toFixed(4)};
const float BD_HOLD_HI = ${c.holdHi.toFixed(4)};
const float BD_SUBJ_LO = ${c.subjLo.toFixed(4)};
const float BD_SUBJ_HI = ${c.subjHi.toFixed(4)};
const float BD_DARK = ${c.vetoDark.toFixed(4)};
const float BD_AB2 = ${(c.abWeight*c.abWeight).toFixed(4)};
const float ON_CONF_LO = ${G.confLo.toFixed(4)};
const float ON_CONF_HI = ${G.confHi.toFixed(4)};
const float SEG_POP_LO = ${Z.popLo.toFixed(4)};
const float SEG_POP_HI = ${Z.popHi.toFixed(4)};
const float SEG_ALPHA_R = ${Z.alphaR.toFixed(4)};
const float SEG_RAMP_IN = ${Z.rampIn.toFixed(4)};
const float SEG_TRUST_LO = ${Z.trustLo.toFixed(4)};
const float SEG_TRUST_HI = ${Z.trustHi.toFixed(4)};
const float SEG_EV_LO = ${Z.evLo.toFixed(4)};
const float SEG_EV_HI = ${Z.evHi.toFixed(4)};
const float SEG_EV_FAR = ${Z.evFar.toFixed(4)};
const float SEG_RAMP_EV = ${Z.rampEv.toFixed(4)};
const float SEG_THIN_LEVELS = ${Z.thinLevels.toFixed(4)};
const float SEG_JBU_K = ${Z.jbuK.toFixed(4)};
const float SEG_JBU_NOISE = ${Z.jbuNoise.toFixed(4)};
const float SEG_JBU_LO = ${Z.jbuLo.toFixed(4)};
const float SEG_JBU_HI = ${Z.jbuHi.toFixed(4)};
const float SR_DARK_LO = ${W.darkLo.toFixed(4)};
const float SR_DARK_HI = ${W.darkHi.toFixed(4)};
const float SR_POP_GATE = ${W.popGate.toFixed(4)};
const float SR_CAST = ${W.cast.toFixed(4)};
const float SR_CAST_MAX = ${W.castMax.toFixed(4)};
const float SR_COS = ${Math.cos(W.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(W.hue).toFixed(6)};
const float SR_WARM = ${W.warm.toFixed(4)};
const float SR_WARM_SHARE = ${W.warmShare.toFixed(4)};
const float SR_FAR_KEEP = ${W.farKeep.toFixed(4)};
const float SR_EDGE = ${W.edge.toFixed(4)};
const float SEG_PACK = ${W.pack.toFixed(4)};
const float SEG_LEVELS = ${W.levels.toFixed(4)};
const float SR_LIT_LO = ${W.litLo.toFixed(4)};
const float SR_LIT_HI = ${W.litHi.toFixed(4)};
const float SR_HI_LO = ${W.hiLo.toFixed(4)};
const float SR_HI_HI = ${W.hiHi.toFixed(4)};
const float SR_DETAIL = ${W.detail.toFixed(4)};
const float SR_R_MIN = ${W.rMin.toFixed(4)};
const float SR_R_MAX = ${W.rMax.toFixed(4)};
const float SR_LIFT = ${W.lift.toFixed(4)};
const float SR_X_WARM = ${W.boostWarm.toFixed(4)};
const float SR_X_WARM_SHARE = ${W.boostWarmShare.toFixed(4)};
const float SR_X_DETAIL = ${W.boostDetail.toFixed(4)};
const float SR_X_LIFT = ${W.boostLift.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(G.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(G.warmHue).toFixed(6)};
const float ON_WARM_LO = ${G.warmLo.toFixed(4)};
const float ON_WARM_HI = ${G.warmHi.toFixed(4)};
${Object.entries(_t).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(vt).map(([e,t])=>`const float BW_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(kt).map(([e,t])=>`const float RL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(yt).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
const float TONE_TOE_LO = ${Et.lo.toFixed(6)};
const float TONE_TOE_HI = ${Et.hi.toFixed(6)};
`,ir=rr.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`);`${rr}${et()}${Le}`,`${ir}${tt()}${Re}`;const ar=ft.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),or=ft.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),sr=`
void dgTap(vec2 uv, vec3 src, float ws, float kk, inout vec3 acc, inout float sw) {
  vec3 c = textureLod(u_source, uv, 0.0).rgb;
  vec3 d = c - src;
  float w = ws * exp(-dot(d, d) * kk);
  acc += w * c;
  sw += w;
}
vec3 detailBase(vec2 suv, vec3 src) {
  float guard = p[16].z;
  if (guard <= 0.0) return src;
  vec2 tx = 1.0 / vec2(textureSize(u_source, 0));
  float kk = DG_K / (guard * guard);
  vec3 acc = src;
  float sw = 1.0;
${ar}
  return acc / sw;
}`,cr=`
fn dgTap(uv: vec2<f32>, src: vec3<f32>, ws: f32, kk: f32) -> vec4<f32> {
  let c = textureSampleLevel(u_source, samp, uv, 0.0).rgb;
  let d = c - src;
  let w = ws * exp(-dot(d, d) * kk);
  return vec4<f32>(c * w, w);
}
fn detailBase(suv: vec2<f32>, src: vec3<f32>) -> vec3<f32> {
  let guard = params.p[16].z;
  if (guard <= 0.0) { return src; }
  let tx = 1.0 / vec2<f32>(textureDimensions(u_source));
  let kk = DG_K / (guard * guard);
  var acc = vec4<f32>(src, 1.0);
${or}
  return acc.xyz / acc.w;
}`,lr=e=>e.replaceAll(`dgTap`,`dgTapNr`).replaceAll(`detailBase`,`detailBaseNr`).replaceAll(`u_source`,`u_tpNr`);lr(sr),lr(cr);function ur(e){let t=Math.floor((e+8)/W.pack),n=Math.floor((t+.5)/(W.levels+1));return[e-W.pack*t,(t-(W.levels+1)*n)/W.levels,n/Z.thinLevels]}function dr(e){let t=e.settings.hazeAuto!==!1,n=Mt(Wt((t?qt:e=>e)(Ht(Yt(ge(e.params),Lt(e.settings)),e.settings)),e.settings),e.settings),r=Te(Ut(_e(Rt(e.settings),n),e.settings),n);return{...e,params:n,settings:{...Jt(t?Kt(r,n):r,n),vivid:Ct(n,e.settings),blue:Ft(n,e.settings)},seabed:fr(n,e.settings),waterTint:Pt(e.settings),fitLook:qe(n,e.settings),fitLookGate:Je(n,e.settings),fitLookMix:Ye(e.settings)}}function fr(e,t){return Or(t.seabed??0,0,1)*Or(e.seabedNeed??0,0,1)*(1-Or(e.backdrop??0,0,1))}function pr(e,t,n){let r=V.grid,i=e.seabedGrid;if(!i||i.length!==r*r)return 0;let a=t*r-.5,o=n*r-.5,s=Math.floor(a+.5),c=Math.floor(o+.5),l=a-s,u=o-c,d=[.5*(.5-l)*(.5-l),.75-l*l,.5*(.5+l)*(.5+l)],f=[.5*(.5-u)*(.5-u),.75-u*u,.5*(.5+u)*(.5+u)],p=0;for(let e=0;e<3;e++)for(let t=0;t<3;t++)p+=d[t]*f[e]*i[Or(c+e-1,0,r-1)*r+Or(s+t-1,0,r-1)];return Q(V.wLo,V.wHi,p)*Q(V.y0,V.y1,n)}const mr=.12;function hr(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=0,b=0,x=0,S=0,C=0,w=0,ee=0,T=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of T){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*mr*mr)),p=s*4,T=e.person?e.person[s]:0;h+=f*e.fields[p],g+=f*e.fields[p+1],_+=f*e.fields[p+2],v+=f*e.fields[p+3],b+=f*T,y+=f,x+=o*e.fields[p],S+=o*e.fields[p+1],C+=o*e.fields[p+2],w+=o*e.fields[p+3],ee+=o*T}let E=Math.min(1,y/.08);return y<1e-6?[x,S,C,w,0,ee]:[h/y,g/y,_/y,v/y,E,b/y]}function gr(e,t,n,r){let i=r*e.bins-1,a=t=>{let n=t*e.bins;if(i<0)return e.data[n]*(i+1);let r=Math.min(e.bins-1,Math.floor(i)),a=Math.min(e.bins-1,r+1),o=Math.min(1,Math.max(0,i-r));return e.data[n+r]+(e.data[n+a]-e.data[n+r])*o},o=Math.min(Math.max(t*e.tilesX-.5,0),e.tilesX-1),s=Math.min(Math.max(n*e.tilesY-.5,0),e.tilesY-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.tilesX-1),d=Math.min(l+1,e.tilesY-1),f=o-c,p=s-l,m=a(l*e.tilesX+c)*(1-f)+a(l*e.tilesX+u)*f,h=a(d*e.tilesX+c)*(1-f)+a(d*e.tilesX+u)*f;return m*(1-p)+h*p}function _r(e,t,n,r,i,a,o,s=0){let{params:l,settings:u}=e,d=o?o[0]:t,f=o?o[1]:n,p=o?o[2]:r,m=C(d),h=C(f),v=C(p),y=nt.mu0+nt.mu1*Math.max(f,p)+nt.mu2*d,[b,x,S,ee,E,O]=hr(e.depth,i,a,m,h,v),te=Or(O,0,1),ne=Math.max(.02,l.zHi-l.zLo),re=Or((y-l.zLo)/ne,0,1.15),ie=re+(Or(b+Or(l.depthGuide*(y-S)/ne,-.25,.25),0,1.15)-re)*E,k=1+(ee-1)*E,ae=[m,h,v],A=Math.max(1e-5,T(m,h,v)),oe=[0,0,0],se=[0,0,0],j=0,ce=0,le=Math.min(1,k);for(let e=0;e<3;e++){let t=u.veil*l.binf[e]*(1-Math.exp(-(l.betaB[e]*ie+l.cB[e])));oe[e]=k*t,se[e]=le*t;let n=e===0?.2126:e===1?.7152:.0722;j+=oe[e]*n,ce+=se[e]*n}let ue=Math.max(0,(A-j)/A),de=D(m,h,v),fe=de[1],pe=de[2],me=Q(l.subLo,l.subHi,ue)*(1-Vr(fe,pe,l))*(1-N.greenProp*we(l)),he=Math.max(l.floorFrac,1-ce/A),ge=[0,1,2].map(e=>Math.min(l.gainCap,Math.max(1/l.gainCap,Math.exp(l.attn[e]*(ie-l.zMean))))),_e=ke(ae,De(e.depth,i,a,m,h,v),ge.map((e,t)=>Math.max(e*l.wb[t],l.waterWb[t])),oe),M=_e.c,ve=Ne(_e.snrR),P=Ae(l.waterWb[0],ge[0]*l.wb[0],_e.snrR),ye=[0,0,0];for(let e=0;e<3;e++){let t=M[e],n=Math.max(t-se[e],t*l.floorFrac),r=t*he+(n-t*he)*me,i=ge[e]*l.wb[e];ye[e]=r*(e===0?1+(i-1)*ve:i)}let be=Q(l.confLo,l.confHi,ue),xe=Q(at.lo,at.hi,ue),Se=ht(l),Ce=l.backdropFit,Te=Se>0&&Ce&&Ce.length===18?g(de[0],fe,pe,i,a,Ce):1,Oe=Math.min(be,Math.max(Ur(fe,pe,l)*(1+(Te-1)*Se),xe,we(l)*N.greenObj)),Fe=te*Q(ot.lo,ot.hi,A),Ie=1+(Te-1)*Se,Le=Math.max(Math.min(Or(x,0,1),Ie)*E+Oe*(1-E),Fe)*be*(1-Se*Nr(m,h,v)),Re=e.settings.subjectPop?Or(l.subjectTone??0,0,1):0,ze=Se>0&&Ce&&Ce.length===18?_(de[0],fe,pe,i,a,Ce):1,F=Se>0&&Ce&&Ce.length===18?Math.max(Kr(e.depth,i,a,Or(x,0,1)*E,ze),s*Q(c.subjLo,c.subjHi,ze)):0,[Be,Ve]=Yr(e.depth,i,a),I=e.seg&&e.settings.subjectPop?xr(e.seg.strength,i,a,e.seg.guide):null,He=e.settings.subjectPop?mt(e.settings):0,[,Ue,We]=D(l.veilColor[0],l.veilColor[1],l.veilColor[2]),Ge=Math.hypot(Ue,We)||1,Ke=Math.max(F,Se>0?Ve*Q(c.holdLo,c.holdHi,ze):0)*Se*Re*Be;if(e.debug)return[E,Oe,Or(x,0,1)];let L=[0,0,0],qe=l.exposure**+l.waterExposure,Je=1-u.dehaze*Math.min(.9,ce/A)*Q(st.lo,st.hi,A);for(let e=0;e<3;e++){let t=M[e]*(e===0?P:l.waterWb[e])*qe*Je;L[e]=t+(ye[e]*l.exposure-t)*Le}let Ye=lt(l,u.hazeLift),Xe=1;if(Ye[0]+Ye[1]+Ye[2]>0){let e=T(L[0],L[1],L[2]),t=Vr(fe,pe,l),n=ut(e,u.hazeLift*l.hazeBlack*(1-ct.farKeep));for(let e=0;e<3;e++)L[e]*=ut(L[e],Ye[e])+(n-ut(L[e],Ye[e]))*t;Xe=e>1e-6?T(L[0],L[1],L[2])/e:1}let R=T(L[0],L[1],L[2]),$e=R+((R-l.black)/(l.white-l.black)-R)*l.levelsMix,z=R>1e-5?Math.max(0,$e)/R:1;for(let e=0;e<3;e++)L[e]*=z;R=Math.max(0,$e);let B=Math.cbrt(Math.max(0,R)),et=I?Cr(I,de,Ue/Ge,We/Ge,Re,He):0,tt=(I?et:U.engineKeep*jr(Ke)*(pt.edgeFloor+(1-pt.edgeFloor)*Q(c.subjLo,c.subjHi,ze)))*Q(U.darkLo,U.darkHi,B),rt=Math.max(ht(l),I?Sr(I[3]):0),it=tt*rt*He,ft=I?et*Q(W.darkLo,W.darkHi,B)*He:0;if(u.clarity>0){let t=w(Or(R,0,1)),n=C(Or(t+(gr(e.clahe,i,a,t)-t)*(u.clarity+U.clarity*it),0,1));z=R>1e-5?n/R:1;for(let e=0;e<3;e++)L[e]*=z}{let e=T(L[0],L[1],L[2]),t=Gn(A,l.shadowFloor)*A*qe*Xe,n=Math.max(e,t);if(n=Me(n,A,we(l)*(1-Le)),n>l.knee&&(n=l.knee+(1-l.knee)*(1-Math.exp(-(n-l.knee)/(1-l.knee)))),e>1e-6){if(n!==e){let t=n/e;L[0]*=t,L[1]*=t,L[2]*=t}}else{let e=n/A;L[0]=ae[0]*e,L[1]=ae[1]*e,L[2]=ae[2]*e}}let[,K,_t]=D(m,h,v),vt=Math.hypot(K,_t),yt=D(Math.max(0,L[0]),Math.max(0,L[1]),Math.max(0,L[2])),bt=yt[0],xt=yt[1],St=yt[2],Ct=Math.hypot(xt,St),wt=l.chromaK*vt+l.chromaC0,Tt=Ct>wt?wt/Ct:1,Et=Q(gt.cLo,gt.cHi,vt)*Vr(K,_t,l),Ot=gt.keep*vt*Et;Ct>1e-6&&Ct*Tt<Ot&&(Tt=Ot/Ct),Tt*=u.saturation;let kt=Hr(K,_t,l,G.farLo,G.farHi);[xt,St]=Ee(bt,xt,St,we(l)*(1-N.gnObjKeep*Le));let At=Ar(bt,xt,St,m,h,v,kt,I?0:tt,rt)*Q(U.keepDarkLo,U.keepDarkHi,bt),jt=te*(1-ht(l)*Nr(m,h,v));Tt*=Mr(xt,St,m,h,v,kt,jt,I?ht(l):rt);let[Mt,Nt]=kr(xt*Tt,St*Tt,Ue/Ge,We/Ge,At/G.mix),Pt=Q(H.castLo,H.castHi,Math.hypot(xt,St)*Tt),Ft=bt,It=Pr(Ft,Mt,Nt,jt),Lt=Fr(Ft,It[0],It[1],u.look,1-Ur(fe,pe,l),Bt(l),zt(l)),Rt=Pe(Lt[0],Lt[1],Lt[2],K,_t,te,kt),Vt=je(Lt[0],Rt[0],Rt[1],we(l),kt),Ht=Ir(Lt[0],Vt[0],Vt[1],u.vivid??0,we(l)),Ut=it>0&&!I?Ir(Lt[0],Vt[0],Vt[1],(u.vivid??0)*(1-U.vividKeep*Math.min(1,it)),we(l))[0]:Ht[0],Wt=I?e.seg.popDir??1:1,Gt=I?Ut:Ut+U.lift*it*Wt*4*Ut*Math.max(0,1-Ut),Kt=1+(U.chromaFollowDark+(U.chromaFollow-U.chromaFollowDark)*Q(U.keepDarkLo,U.keepDarkHi,Ut))*(Gt/Math.max(1e-4,Ut)-1);Ht[0]=Gt,Ht[1]*=Kt,Ht[2]*=Kt;let qt=Br(Ht[0],Ht[1],Ht[2]),Jt=br(qt[0],qt[1],K,_t,Or(tt*rt,0,1)),Yt=Q(H.wLo,H.wHi,tt)*(I?0:Q(c.subjLo,c.subjHi,ze))*(u.subjectPop?Math.min(1,Math.max(0,u.subjectPopWarmth??0)):0)*Pt,Xt=yr(Ht[0],Jt[0],Jt[1],Yt),J=Lr(Ht[0],Xt[0],Xt[1],u.blue??0,we(l));if([J[1],J[2]]=Rr(J[1],J[2],e.waterTint??0,we(l)),[J[1],J[2]]=zr(J[0],J[1],J[2],u.vivid??0),(e.seabed??0)>0){let t=pr(l,i,a)*(1-Et)*e.seabed;J[0]+=V.lift*t,J[1]+=(Math.cos(V.hue)*V.chroma+V.keep*J[1]-J[1])*t,J[2]+=(Math.sin(V.hue)*V.chroma+V.keep*J[2]-J[2])*t}if(ft>0){let t=(A+dt.eps)/(Tr(e.depth,i,a)+dt.eps);[J[0],J[1],J[2]]=Dr(J[0],J[1],J[2],ft,u.subjectPop?Math.min(1,Math.max(0,u.subjectPopWarmth??0)):0,t,0,Er(I),He>1?ft*(1-1/He):0)}if((l.toneGamma??1)>1&&(J[0]=Dt(J[0],l.toneGamma)),te>0){let t=1-Et;[J[1],J[2]]=Qe(J[0],J[1],J[2],Q(q.wLo,q.wHi,te)*t,Q(q.wLo,q.wHi,jt)*t,Math.max(Ze(K,_t),Ze(...wr(e.depth,i,a)),ht(l)))}let Zt=o?qr(t,n,r,m,h,v):1,Qt=Math.max(vt,Yt*H.cMin*1.5,J[3]);e.lookTap&&e.lookTap(J[0],J[1],J[2],Qt,Zt,u.strength,e.fitLookGate??0,e.fitLookMix??0);let[$t,en,tn]=vr(J[0],J[1],J[2],Qt,Zt,e.fitLook??0,e.fitLookMix??0);if(e.trace){let t=e=>e.map(e=>+e.toFixed(3));Object.assign(e.trace,{subj:Ke,srcC:t(M),redS:+ve.toFixed(2),lin:t([m,h,v]),z:+ie.toFixed(2),k:+E.toFixed(2),conf:+Le.toFixed(2),veilScale:+k.toFixed(2),B:t(oe),sig:+ue.toFixed(2),wSub:+me.toFixed(2),full:t(ye),outPreLevels:t(L.map(e=>e)),Y:+R.toFixed(3),C:+Ct.toFixed(3),cMax:+wt.toFixed(3),scale:+Tt.toFixed(2),o2:t([$t,en,tn])})}return[t+($t-t)*u.strength,n+(en-n)*u.strength,r+(tn-r)*u.strength]}function vr(e,t,n,r,i,a,o,s){let c=Ke(e,t,n,a,o,s),l=A(c[0],c[1],c[2],r),[u,d,f]=O(c[0],l[0],l[1]),[p,m,h]=oe(u*i,d*i,f*i);return[w(p),w(m),w(h)]}function yr(e,t,n,r){if(r<=0)return[t,n];let i=Math.min(H.cMax,Math.max(H.keep*Math.hypot(t,n),H.cMin*Q(H.lLo,H.lHi,e))),a=Math.cos(H.hue),o=Math.sin(H.hue),s=t*a+n*o,c=Math.max(0,1-r)**+H.side,l=s+(i-s)*r;return[a*l+(t-a*s)*c,o*l+(n-o*s)*c]}function br(e,t,n,r,i){let a=Math.hypot(e,t),o=Math.hypot(n,r);if(i*=Q(.01,.04,o),i<=0||a<1e-4)return[e,t];let s=e/a,c=t/a,l=n/o,u=r/o,d=Math.cos(U.hueMax),f=Math.sin(U.hueMax);if(s*l+c*u>=d)return[e,t];let p=Math.sign(l*c-u*s),m=l*d-p*u*f,h=u*d+p*l*f,g=s+(m-s)*i,_=c+(h-c)*i,v=Math.hypot(g,_)||1;return[a*g/v,a*_/v]}function xr(e,t,n,r){let i=Math.min(Math.max(t*e.width-.5,0),e.width-1),a=Math.min(Math.max(n*e.height-.5,0),e.height-1),o=Math.floor(i),s=Math.floor(a),c=Math.min(o+1,e.width-1),l=Math.min(s+1,e.height-1),u=i-o,d=a-s,f=[0,0,0,0,0,0],p=(e,t,n,r)=>(e+(t-e)*u)*(1-d)+(n+(r-n)*u)*d;for(let i=0;i<4;i++){let a=e.data[(s*e.width+o)*4+i],m=e.data[(s*e.width+c)*4+i],h=e.data[(l*e.width+o)*4+i],g=e.data[(l*e.width+c)*4+i];if(i===0){let e=ur(a),t=ur(m),n=ur(h),r=ur(g);f[0]=p(e[0],t[0],n[0],r[0]),f[4]=p(e[1],t[1],n[1],r[1]),f[5]=p(e[2],t[2],n[2],r[2])}else f[i]=p(a,m,h,g);if(i===2&&r){let i=Math.min(a,m,h,g),p=Math.max(a,m,h,g);if(p-i>1e-4&&i<Z.jbuHi&&p>Z.jbuLo){let i=r(t,n);if(i>=0){let t=(t,n)=>r((t+.5)/e.width,(n+.5)/e.height),n=nr([(1-u)*(1-d),u*(1-d),(1-u)*d,u*d],[t(o,s),t(c,s),t(o,l),t(c,l)],i),p=n[0]+n[1]+n[2]+n[3];p>1e-5&&(f[2]=(n[0]*a+n[1]*m+n[2]*h+n[3]*g)/p)}}}}return f}function Sr(e){return e>0?Q(Z.popLo,Z.popHi,e):0}function Cr(e,t,n,r,i,a){if(e[3]<=0)return 0;let o=(e[2]-.5)*2*Z.alphaR,s=Z.evFar+(1-Z.evFar)*Or(e[4]??1,0,1),c=e[0]>=0&&e[0]<=2,l=c?Q(Z.evLo*s,Z.evHi*s,Math.hypot(t[0]-e[0],t[1]*r-t[2]*n)):1,u=l+(1-l)*Q(Z.trustLo,Z.trustHi,o);return Q(0,c?Z.rampIn+(Z.rampEv-Z.rampIn)*l*Or(e[5]??0,0,1):Z.rampIn,o)*u*Math.max(i,Sr(e[3]))*e[1]*Math.min(1,W.popGate*a)}function wr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=t=>{let n=(n,r)=>e.guide[(r*e.width+n)*3+t];return(n(a,o)+(n(s,o)-n(a,o))*l)*(1-u)+(n(a,c)+(n(s,c)-n(a,c))*l)*u},f=D(Math.max(0,d(0)),Math.max(0,d(1)),Math.max(0,d(2)));return[f[1],f[2]]}function Tr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>{let r=(n*e.width+t)*3;return T(e.guide[r],e.guide[r+1],e.guide[r+2])};return(d(a,o)+(d(s,o)-d(a,o))*l)*(1-u)+(d(a,c)+(d(s,c)-d(a,c))*l)*u}function Er(e){let t=(e[2]-.5)*2*Z.alphaR,n=Or(e[4]??1,0,1);return Q(0,W.edge,t)*(W.farKeep+(1-W.farKeep)*n)}function Dr(e,t,n,r,i,a,o=0,s=1,c=0){if(r<=0)return[e,t,n];let l=W,u=Math.cos(l.hue),d=Math.sin(l.hue),f=Math.hypot(t,n),p=f>1e-5?Q(0,.5,-(t*u+n*d)/f):0,m=1-Math.min(l.castMax,l.cast*r)*p*s;t*=m,n*=m;let h=Q(l.litLo,l.litHi,e)*(1-Q(l.hiLo,l.hiHi,e)),g=Math.min((l.warm*r+l.boostWarm*c)*Math.min(1,2*i)*h*s,(l.warmShare+l.boostWarmShare*c)*Math.max(0,-(t*u+n*d)));t+=u*g,n+=d*g;let _=e*Or(a,l.rMin,l.rMax)**+(l.detail*r+l.boostDetail*c);return _+=Math.max(0,l.lift*r+l.boostLift*c-o)*4*_*Math.max(0,1-_),[_,t,n]}function Or(e,t,n){return e<t?t:e>n?n:e}function Q(e,t,n){let r=Or((n-e)/(t-e),0,1);return r*r*(3-2*r)}function kr(e,t,n,r,i){let a=Math.hypot(e,t);if(i<=0||a<1e-6)return[e,t];let o=Math.max(0,e*n+t*r),s=Math.max(0,(a-i*Math.min(pt.k*o,pt.cMax))*(1-i*pt.desat));return[e*s/a,t*s/a]}function Ar(e,t,n,r,i,a,o,s,c){if(c<=0||s<=0)return 0;let l=Math.hypot(t,n);if(l<1e-5)return 0;let u=(t*Math.cos(G.hue)+n*Math.sin(G.hue))/l,d=Q(Math.cos(G.bandOut),Math.cos(G.bandIn),u),f=1-Q(G.rLo,G.rHi,r/Math.max(1e-4,i,a)),p=Q(G.lLo,G.lHi,e);return c*G.mix*s*(d+(1-d)*f)*f*p*(1-o)}function jr(e){return Q(G.confLo,G.confHi,e)}function Mr(e,t,n,r,i,a,o,s){if(s<=0)return 1;let c=Math.hypot(e,t);if(c<1e-5)return 1;let l=(e*Math.cos(G.warmHue)+t*Math.sin(G.warmHue))/c;return 1-s*(1-Q(G.rLo,G.rHi,n/Math.max(1e-4,r,i)))*Q(G.warmLo,G.warmHi,l)*(1-a)*(1-Or(o,0,1))}function Nr(e,t,n){return 1-Q(G.rLo,G.rHi,e/Math.max(1e-4,t,n))}function Pr(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n),a=Math.atan2(n,t),o=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),s=Math.max(1-Q(q.bandIn,q.bandOut,Math.abs(o(a-q.bandHue))),1-Q(q.achroma*.5,q.achroma,i)),c=Q(q.wLo,q.wHi,r)*s*Q(q.lLo,q.lHi,e)*(1-Q(q.cLo,q.cHi,i));if(c<=0)return[t,n];let l=a+o(q.hue-a)*q.mix*c,u=i+Math.max(0,q.cMin-i)*c;return[u*Math.cos(l),u*Math.sin(l)]}function Fr(e,t,n,r,i,a,o=0){if(r<=0)return[e,t,n];let s=Math.hypot(t,n),c=Math.atan2(n,t),l=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),u=Q(K.keepLo,K.keepHi,s),d=(1-Q(K.warmIn,K.warmOut,Math.abs(l(c-K.warmHue))))*Q(K.warmLo+K.warmHaze*a,K.warmHi+K.warmHaze*a,s),f=Q(K.farLo,K.farHi,Math.abs(l(c-K.targetHue))),p=K.darkLo+(K.darkHi-K.darkLo)*(1-K.darkHaze*a),m=(1-u)*(1-d)*(1-Q(K.brightLo,K.brightHi,e))*Q(K.darkLo,p,e)*(1-K.farKeep*(1-a)*f)*r*K.mix,h=Math.max(0,e)**+(1+K.gamma*r)*(1-K.waterDim*r*i*(1-a)),g=Math.max(s,K.c0+K.c1*h),_=Math.max(s,(K.c0+K.c1*h)*(1+K.hazeChroma*a)),v=g+(K.objChroma-g)*a,y=v+(_-v)*Math.max(i,o),b=1-r*K.neutralDesat*(1-Q(K.neutralLo,K.neutralHi,s))*Q(K.neutralLLo,K.neutralLHi,e);return[h,(t+(y*Math.cos(K.targetHue)-t)*m)*b,(n+(y*Math.sin(K.targetHue)-n)*m)*b]}function Ir(e,t,n,r,i){if(r<=0)return[e,t,n];let a=_t,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=s-a.target-2*Math.PI*Math.round((s-a.target)/(2*Math.PI)),u=Q(a.cLo,a.cHi,o)*Q(a.lLo,a.lHi,e),d=1-Q(a.bandHi0,a.bandHi1,c),f=Q(a.bandLo0,a.bandLo1,c)*d*(1-Q(a.violetCLo,a.violetCHi,o)*Q(a.target,a.bandHi1,c)),p=Q(a.greenLo0,a.greenLo1,c),m=p*(1-Q(a.greenTop0,a.greenTop1,c)),h=s+((1-i)*f*a.pull*-l+i*m*a.greenShift)*u*r,g=(1-i)*f+i*p*d,_=Q(a.darkCLo,a.darkCHi,o),v=g*_*_*r;o*=1+a.chroma*v*(1-i);let y=e*(1-(a.dark+(a.darkGreen-a.dark)*i)*v*Q(a.darkLLo,a.darkLHi,e));y*=1-a.blackK*r*(1-Q(a.blackLo,a.blackHi,y));let b=a.shadowC0+a.shadowC1*Q(a.shadowLLo,a.shadowLHi,y);o>b&&(o-=(o-b)*(1-a.shadowKeep)*r*(1-Q(a.shadowFadeLo,a.shadowFadeHi,y)));let x=r*(1+(g-1)*Q(0,a.liftNeutralC,o))*Q(a.liftLLo,1,e);y+=a.lift*x*(1-y),o*=1-a.hiDesat*x;let S=a.warmC*x;return[y,o*Math.cos(h)+S*Math.cos(a.warmHue),o*Math.sin(h)+S*Math.sin(a.warmHue)]}function Lr(e,t,n,r,i){if(r<=0)return[e,t,n,0];let a=vt,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=Q(a.warmIn0,a.warmIn1,c)*(1-Q(a.warmOut0,a.warmOut1,c))*Q(a.warmCLo,a.warmCHi,o)*Q(a.warmLLo,a.warmLHi,e)*r,u=c+(a.warmHue-c)*a.warmPull*l,d=Math.max(o,Math.min(o*(1+a.warmGain*l),a.warmCMax)),f=d*Math.cos(u),p=d*Math.sin(u),m=t*Math.cos(a.warmDir)+n*Math.sin(a.warmDir),h=1-Q(a.sLo,a.sHi,m),g=Q(a.vcLo,a.vcHi,o)*Q(a.vio0,a.vio1,c)*(1-Q(a.vio2,2*Math.PI,c)),_=Q(a.neutralLLo,a.neutralLHi,e)*(1-Q(a.neutralCLo,a.neutralCHi,o)),v=Math.min(a.cMax,a.cK*e)*(1-a.hiDrop*Q(a.hiLo,a.hiHi,e)),y=Q(a.vegCLo,a.vegCHi,o)*Q(a.vegIn0,a.vegIn1,c)*(1-Q(a.vegOut0,a.vegOut1,c))*(1-a.vegGreen*i),b=Q(a.farLo,a.farHi,a.target-c)*Q(a.farMin0,a.farMin1,c)*Q(a.farCLo,a.farCHi,o),x=a.mix*h*(1-g)*(1-y)*(1-_)*Math.min(1,r*(1+a.farBoost*b));f+=(v*Math.cos(a.target)-f)*x,p+=(v*Math.sin(a.target)-p)*x;let S=1-a.neutralK*_*h*r;return f*=S,p*=S,[e*(1-a.shadowK*r*(1-Q(0,a.shadowHi,e))),f,p,Math.max(v*x,d*l)]}function Rr(e,t,n,r){if(n===0)return[e,t];let i=vt,a=Math.hypot(e,t),o=Math.atan2(t,e),s=o<0?o+2*Math.PI:o,c=1-Q(i.sLo,i.sHi,e*Math.cos(i.warmDir)+t*Math.sin(i.warmDir)),l=Q(i.vcLo,i.vcHi,a)*Q(i.vio0,i.vio1,s)*(1-Q(i.vio2,2*Math.PI,s)),u=Q(i.vegCLo,i.vegCHi,a)*Q(i.vegIn0,i.vegIn1,s)*(1-Q(i.vegOut0,i.vegOut1,s))*(1-i.vegGreen*r),d=n*c*(1-l)*(1-u),f=Math.cos(d),p=Math.sin(d);return[e*f-t*p,e*p+t*f]}function zr(e,t,n,r){let i=Math.hypot(t,n);if(r<=0||i<1e-6)return[t,n];let a=kt,o=Math.atan2(n,t),s=o<0?o+2*Math.PI:o,c=Q(a.warmIn0,a.warmIn1,s)*(1-Q(a.warmOut0,a.warmOut1,s)),l=Q(a.magIn0,a.magIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),u=Q(a.cLo,a.cHi,i)*Q(a.lLo,a.lHi,e)*(1-Q(a.hiLo,a.hiHi,e)),d=Q(a.coolIn0,a.coolIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),f=1+(a.gain*(1-a.coolCut*d)+a.warmGain*c)*(1-l)*u*r*Math.exp(-i/(a.top+(a.warmTop-a.top)*c));return[t*f,n*f]}function Br(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=yt,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*Q(i.lLo,i.lHi,e)*(1-Q(i.cLo,i.cHi,r))*(1-Q(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function Vr(e,t,n){return Hr(e,t,n,n.hueFarLo,n.hueFarHi)}function Hr(e,t,n,r,i){let a=Math.hypot(e,t);if(a<n.achroma)return 0;let[,o,s]=D(n.veilColor[0],n.veilColor[1],n.veilColor[2]),c=Math.hypot(o,s)||1,l=Math.max(-1,Math.min(1,(e*o/c+t*s/c)/a));return(1-Q(Math.cos(i),Math.cos(r),l))*Q(n.achroma,n.achroma*2,a)}function Ur(e,t,n){let r=Math.hypot(e,t);if(r<n.achroma)return 1;let[,i,a]=D(n.veilColor[0],n.veilColor[1],n.veilColor[2]),o=Math.hypot(i,a)||1,s=Math.max(-1,Math.min(1,(e*i/o+t*a/o)/r)),c=1-Q(Math.cos(n.cosHi),Math.cos(n.cosLo),s),l=Q(n.achroma,n.achroma*2,r);return c+(1-c)*(1-l)}function Wr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>e.fields[(n*e.width+t)*4+1];return(d(a,o)*(1-l)+d(s,o)*l)*(1-u)+(d(a,c)*(1-l)+d(s,c)*l)*u}const Gr=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];function Kr(e,t,n,r,i){let a=Math.min(1,Math.max(0,r)),o=0;for(let[r,i]of Gr)o=Math.max(o,Wr(e,t+r*c.ringR/e.width,n+i*c.ringR/e.height));let s=Q(c.subjLo,c.subjHi,i),l=Q(c.coreIn,1,a)*Q(c.coreLo,c.coreHi,i);return Math.max(a*(s+(1-s)*l),Math.min(Math.min(1,o),s))}function qr(e,t,n,r,i,a){let o=T(C(e),C(t),C(n)),s=T(r,i,a);return Or((o+dt.eps)/(s+dt.eps),dt.rMin,dt.rMax)}const Jr=new WeakMap;function Yr(e,t,n){let r=e.animals;if(!r)return[0,0];let i=e.strength??Jr.get(r);i||(i=s(r).data,Jr.set(r,i));let a=r.width,o=r.height,c=Math.min(a-1,Math.max(0,Math.floor(t*a))),l=Math.min(o-1,Math.max(0,Math.floor(n*o))),u=Math.min(Math.max(t*a-.5,0),a-1),d=Math.min(Math.max(n*o-.5,0),o-1),f=Math.floor(u),p=Math.floor(d),m=Math.min(f+1,a-1),h=Math.min(p+1,o-1),g=u-f,_=d-p,v=(e,t)=>i[(t*a+e)*4+1],y=(v(f,p)*(1-g)+v(m,p)*g)*(1-_)+(v(f,h)*(1-g)+v(m,h)*g)*_;return[i[(l*a+c)*4],y]}const $={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=D(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function Xr(e,t,n,r){let i=t*n,a=new Float32Array(i),o=new Float32Array(i);for(let t=0;t<i;t++){let n=.2126*ee[e[t*4]]+.7152*ee[e[t*4+1]]+.0722*ee[e[t*4+2]];a[t]=n,o[t]=n*n}let s=ni(a,t,n,2),c=ni(o,t,n,2),[,l,u]=D(r[0],r[1],r[2]),d=Math.hypot(l,u)||1,f=Math.cos($.hueMax),p=[],m=Math.floor(n*(1-$.near)),h=0,g=0,_=0;for(let r=0;r<n;r+=2)for(let n=0;n<t;n+=2){h++,r>=m&&g++;let i=r*t+n;if(a[i]<$.lumMin)continue;let o=s[i],v=Math.sqrt(Math.max(0,c[i]-o*o));if(v<$.texLo*o||v>$.texHi*o)continue;let[,y,b]=D(ee[e[i*4]],ee[e[i*4+1]],ee[e[i*4+2]]),x=Math.hypot(y,b);x>$.cMax||x>$.achroma&&(y*l+b*u)/(x*d)<f||(p.push(i),r>=m&&_++)}let v=_/Math.max(1,g),y=v>=$.fracHi,b=y?p.filter(e=>e>=m*t):p,x=y?v:p.length/Math.max(1,h);return b.sort((e,t)=>a[t]-a[e]),{idx:b.slice(0,Math.ceil(b.length*$.top)),frac:x}}function Zr(e,t,n,r,i,a,o){return s=>{let c=dr({params:ti(i,s),settings:it,depth:a,clahe:o}),l=0,u=0,d=0;for(let i of r){let r=(i%t+.5)/t,a=(Math.floor(i/t)+.5)/n,o=_r(c,e[i*4]/255,e[i*4+1]/255,e[i*4+2]/255,r,a);l+=C(o[0]),u+=C(o[1]),d+=C(o[2])}let[,f,p]=D(l/r.length,u/r.length,d/r.length);return[f,p]}}function Qr(e,t,n,r){let{idx:i,frac:a}=Xr(e,t,n,r.veilColor);if(a<$.fracLo||i.length<12)return null;let o=Math.max(1,Math.floor(i.length/$.samples)),s=[];for(let e=0;e<i.length;e+=o)s.push(i[e]);return{pick:s,frac:a}}function $r(e,t,n,r,i,a){let o=Qr(e,t,n,r);return o?{ab:Zr(e,t,n,o.pick,r,i,a)([0,0]),frac:o.frac}:null}function ei(e,t,n,r,i,a,o){let s=Qr(e,t,n,r);if(!s)return null;let{frac:c}=s,l=Zr(e,t,n,s.pick,r,i,a),u=e=>Math.max(-$.maxLog,Math.min($.maxLog,e)),d=e=>Math.hypot(e[0]-o[0],e[1]-o[1]),f=[0,0],p=l(f),m=p;for(let e=0;e<$.iterations&&d(p)>$.tol;e++){let e=l([f[0]+$.eps,f[1]]),t=l([f[0],f[1]+$.eps]),n=(e[0]-p[0])/$.eps,r=(e[1]-p[1])/$.eps,i=(t[0]-p[0])/$.eps,a=(t[1]-p[1])/$.eps,s=n*a-i*r;if(!Number.isFinite(s)||Math.abs(s)<1e-6)break;let c=o[0]-p[0],m=o[1]-p[1],h=(a*c-i*m)/s,g=(-r*c+n*m)/s,_=Math.hypot(h,g);_>$.maxStep&&(h*=$.maxStep/_,g*=$.maxStep/_);let v=!1;for(let e=0;e<3&&!v;e++,h/=2,g/=2){let e=[u(f[0]+h),u(f[1]+g)],t=l(e);d(t)<d(p)&&(f=e,p=t,v=!0)}if(!v)break}return{log:f,frac:c,before:m,after:p}}function ti(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*$.water),a=Math.exp(t[1]*$.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}function ni(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0,s=0;for(let i=Math.max(0,n-r);i<=Math.min(t-1,n+r);i++)o+=e[a*t+i],s++;i[a*t+n]=o/s}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0,c=0;for(let a=Math.max(0,e-r);a<=Math.min(n-1,e+r);a++)s+=i[a*t+o],c++;a[e*t+o]=s/c}return a}function ri(e,t,n=!1){let r=t.backdropFit??e.backdropFit,i={seabedNeed:t.seabedNeed??e.seabedNeed,seabedLw:t.seabedLw??e.seabedLw,seabedLb:t.seabedLb??e.seabedLb,seabedGrid:t.seabedGrid??e.seabedGrid},a=t.frameBlack??t.hazeBlack,o=ii.margin>0&&e.hazeBlack>1e-6?Math.min(1,ii.margin*a/e.hazeBlack):1,s={frameBlack:a,...o<1?{hazeBlack:e.hazeBlack*o,hazeFloor:e.hazeFloor.map(e=>e*o)}:{}};return n?{...e,...i,...s,backdropFit:r}:{...e,...i,...s,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}const ii={margin:1.1},ai={calmLo:.1,calmHi:.4,openLo:.05,openHi:.3},oi={trendTrust:.5,minSamples:4,kendall:.8,deadband:.1,stepMax:.6,maxRate:.1,maxSwing:Math.log(1.24),spreadLo:.06,spreadHi:.18,residual:.008};function si(e){let t=e.filter(e=>e.w>0&&Number.isFinite(e.log[0])&&Number.isFinite(e.log[1])).sort((e,t)=>e.t-t.t);if(!t.length)return null;let n=t.map(e=>e.w),r=e=>{let t=hi(e,n),r=hi(e.map(e=>Math.abs(e-t)),n);return t*(1-di(oi.spreadLo,oi.spreadHi,r))},i={t:[hi(t.map(e=>e.t),n)],r:[r(t.map(e=>e.log[0]))],b:[r(t.map(e=>e.log[1]))]},a=t.filter(e=>e.w>=oi.trendTrust);if(a.length<oi.minSamples)return i;let o=a.map(e=>e.t),s=a.map(e=>e.w),c=ci(o,a.map(e=>e.log[0]),s);return!c||Math.abs(c[c.length-1]-c[0])<oi.deadband?i:{t:o,r:c,b:ci(o,a.map(e=>e.log[1]),s)??o.map(()=>hi(a.map(e=>e.log[1]),s))}}function ci(e,t,n){let r=t.map((e,n)=>pi(t[Math.max(0,n-1)],t[n],t[Math.min(t.length-1,n+1)])),i=gi(r);if(Math.abs(i)<oi.kendall)return null;let a=_i(r,n,i>0),o=Math.abs(a[a.length-1]-a[0]);for(let e=1;e<a.length;e++)if(Math.abs(a[e]-a[e-1])>oi.stepMax*o)return null;let s=a.length>>1;for(let t=s+1;t<a.length;t++)a[t]=mi(a[t],a[t-1],oi.maxRate*(e[t]-e[t-1]));for(let t=s-1;t>=0;t--)a[t]=mi(a[t],a[t+1],oi.maxRate*(e[t+1]-e[t]));let c=Math.min(a[0],a[a.length-1]),l=Math.max(a[0],a[a.length-1]),u=l-c>oi.maxSwing?oi.maxSwing/(l-c):1,d=(c+l)/2;return a.map(e=>Math.max(-$.maxLog,Math.min($.maxLog,d+(e-d)*u)))}function li(e,t,n,r,i){let a=e.map((e,i)=>({px:e,t:t[i]??i,a:Pn(e,n,r)})),o=[],s=[];for(let e of a){if(ui(e.a.params)<.5)continue;let t=$r(e.px,n,r,ri(i,e.a.params),e.a.depth,e.a.clahe);!t||t.frac<$.fracHi||(o.push(t.ab[0]),s.push(t.ab[1]))}if(o.length<2)return null;let c=[Math.min(fi(o),$.neutral[0]+$.pinkMax),fi(s)],l=[];for(let e of a){let t=ui(e.a.params);if(t<=0)continue;let a=ei(e.px,n,r,ri(i,e.a.params),e.a.depth,e.a.clahe,c);if(!a)continue;let o=Math.max(Math.abs(a.log[0]),Math.abs(a.log[1]))>=$.maxLog-1e-6,s=Math.hypot(a.after[0]-c[0],a.after[1]-c[1])>oi.residual;!o&&!s&&l.push({t:e.t,log:a.log,w:di($.fracLo,$.fracHi,a.frac)*t})}return{target:c,curve:si(l),samples:l}}function ui(e){let t=Math.max(e.calm??0,e.calmTone??0),n=di(ai.openLo,ai.openHi,e.backdrop??0);return(1-di(ai.calmLo,ai.calmHi,t))*(1-n)*(1-we(e))}function di(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function fi(e){let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function pi(e,t,n){return Math.max(Math.min(e,t),Math.min(Math.max(e,t),n))}function mi(e,t,n){return Math.max(t-n,Math.min(t+n,e))}function hi(e,t){let n=e.map((e,n)=>({x:e,w:Math.max(0,t[n]??0)})).filter(e=>e.w>0).sort((e,t)=>e.x-t.x);if(!n.length)return 0;let r=n.reduce((e,t)=>e+t.w,0)/2,i=0;for(let e=0;e<n.length;e++){if(i+=n[e].w,Math.abs(i-r)<1e-12&&e+1<n.length)return(n[e].x+n[e+1].x)/2;if(i>r)return n[e].x}return n[n.length-1].x}function gi(e){let t=0,n=0;for(let r=0;r<e.length;r++)for(let i=r+1;i<e.length;i++)t+=Math.sign(e[i]-e[r]),n++;return n?t/n:0}function _i(e,t,n){let r=n?e:e.map(e=>-e),i=[];for(let e=0;e<r.length;e++)for(i.push({sum:r[e]*t[e],w:t[e],n:1});i.length>1&&i[i.length-2].sum/i[i.length-2].w>i[i.length-1].sum/i[i.length-1].w;){let e=i.pop(),t=i[i.length-1];t.sum+=e.sum,t.w+=e.w,t.n+=e.n}let a=[];for(let e of i)for(let t=0;t<e.n;t++)a.push((n?1:-1)*(e.sum/e.w));return a}self.onmessage=e=>{if(e.data.kind===`balance`){let{id:t,width:n,height:r,shots:i}=e.data,a={kind:`balance`,id:t,shots:i.map(e=>{let t=li(e.thumbs.map(e=>new Uint8ClampedArray(e)),e.times,n,r,e.lock);return t?{target:t.target,curve:t.curve}:null})};self.postMessage(a);return}let{id:t,rgba:n,width:r,height:i,seeds:a}=e.data,o=performance.now(),s=Pn(new Uint8ClampedArray(n),r,i,{seeds:a}),c=Xt(s.depth),l=J(s.depth),u=Zt(s.clahe),d={id:t,params:s.params,mean:s.mean,fields:{width:s.depth.width,height:s.depth.height,data:c},guide:{width:s.depth.width,height:s.depth.height,data:l},clahe:{tilesX:s.clahe.tilesX,tilesY:s.clahe.tilesY,bins:s.clahe.bins,data:u},animals:s.depth.animals,blobs:s.depth.blobs,ms:performance.now()-o},f=[c.buffer,l.buffer,u.buffer];s.depth.animals&&f.push(s.depth.animals.labels.buffer),self.postMessage(d,f)};