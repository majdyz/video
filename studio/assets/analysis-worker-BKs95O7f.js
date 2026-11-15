const e={thr:.25,minArea:.0012,covLo:.6,covHi:.75,weightLo:.5,weightHi:.8,core:.85,coreDev:.08,trimLo:.2,trimHi:.4,erode:2,holeMax:.3,matchIoU:.2,containK:.75,smallCells:160,nearK:.75,nearMin:2.5,nearRatio:2.5,nearIoU:.7,graceS:.35,stabLo:.4,stabHi:.6,confTau:.3,confLo:.4,confHi:.7,tauUp:1,tauDown:.5,leadMaxS:.4,leadMaxCells:12,dilate:2,tapReach:3,bindAhead:.3};function t(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function n(n,i,a,o,s,c,l){let u=a*o,d=new Int32Array(u).fill(-1),f=new Int32Array(u),p=[];for(let r=0;r<u;r++){if(d[r]>=0||n[r]<e.thr)continue;let s=p.length,c=0,m=0,h=0,g=0,_=0,v=0,y=0;for(f[c++]=r,d[r]=s;c>0;){let r=f[--c],u=r%a,p=(r-u)/a;m++,h+=u,g+=p,n[r]>_&&(_=n[r]),l&&l[r]>y&&(y=l[r]),v+=n[r]>=e.core?t(0,e.coreDev,i[r]):t(e.trimLo,e.trimHi,i[r]);for(let t=-1;t<=1;t++)for(let r=-1;r<=1;r++){let i=u+r,l=p+t;if((r|t)===0||i<0||l<0||i>=a||l>=o)continue;let m=l*a+i;d[m]<0&&n[m]>=e.thr&&(d[m]=s,f[c++]=m)}}p.push({area:m/u,sx:h,sy:g,weight:_*(1-y),cov:v/m,px:m})}let m=p.map((e,t)=>t).filter(t=>p[t].area>=e.minArea).sort((e,t)=>p[t].area-p[e].area).slice(0,255),h=new Int32Array(p.length).fill(0),g=[];for(let e of m){let t=p[e];g.push({cx:(t.sx/t.px+.5)*s/a-.5,cy:(t.sy/t.px+.5)*c/o-.5,area:t.area,weight:t.weight,coverage:t.cov}),h[e]=g.length}let _=new Uint8Array(s*c);for(let e=0;e<c;e++){let t=Math.min(o-1,Math.floor((e+.5)*o/c));for(let n=0;n<s;n++){let r=Math.min(a-1,Math.floor((n+.5)*a/s)),i=d[t*a+r];_[e*s+n]=i>=0?h[i]:0}}return r(_,s,c,g.length),{width:s,height:c,labels:_,list:g}}function r(t,n,r,i){let a=n*r,o=new Uint8Array(a),s=new Int32Array(a);for(let c=1;c<=i;c++){let i=0;for(let e=0;e<a;e++)t[e]===c&&i++;if(!i)continue;o.fill(0);let l=0;for(let e=0;e<n;e++)for(let i of[0,r-1]){let r=i*n+e;t[r]!==c&&!o[r]&&(o[r]=1,s[l++]=r)}for(let e=0;e<r;e++)for(let r of[0,n-1]){let i=e*n+r;t[i]!==c&&!o[i]&&(o[i]=1,s[l++]=i)}for(;l>0;){let e=s[--l],r=e%n;for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}for(let r=0;r<a;r++){if(o[r]||t[r]===c)continue;let u=[],d=!0;for(o[r]=1,s[l++]=r;l>0;){let e=s[--l],r=e%n;u.push(e),t[e]!==0&&(d=!1);for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}if(d&&u.length<=e.holeMax*i)for(let e of u)t[e]=c}}}function i(n){return t(e.weightLo,e.weightHi,n.weight)*t(e.covLo,e.covHi,n.coverage)}function a(e,t,n,r){if(r<=0)return e;let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0;for(let i=-r;i<=r;i++){let r=n+i;r>=0&&r<t&&(o=Math.max(o,e[a*t+r]))}i[a*t+n]=o}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0;for(let a=-r;a<=r;a++){let r=e+a;r>=0&&r<n&&(s=Math.max(s,i[r*t+o]))}a[e*t+o]=s}return a}function o(t,n,r){let i=a(t,n,r,e.dilate),o=e.erode,s=new Uint8Array(n*r);for(let e=0;e<r;e++){let r=0;for(let i=-o;i<n;i++){let a=+(i+o<n&&t[e*n+i+o]<=0),c=+(i-o-1>=0&&t[e*n+i-o-1]<=0);r+=a-c,i>=0&&(s[e*n+i]=+(t[e*n+i]>0&&r===0))}}let c=new Float32Array(n*r*4);for(let e=0;e<n;e++){let t=0;for(let a=-o;a<r;a++){let l=+(a+o<r&&!s[(a+o)*n+e]),u=+(a-o-1>=0&&!s[(a-o-1)*n+e]);if(t+=l-u,a>=0){let r=a*n+e;c[r*4]=i[r],c[r*4+1]=+(t===0)}}}return{width:n,height:r,data:c}}function s(e){let t=new Float32Array(e.width*e.height),n=e.list.map(i);for(let r=0;r<t.length;r++)e.labels[r]&&(t[r]=n[e.labels[r]-1]);return o(t,e.width,e.height)}const c={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,smallLo:.0015,smallHi:.0022,smallDevLo:.16,smallDevHi:.24,smallValidLo:.45,smallValidHi:.6,strongDevLo:.38,strongDevHi:.48,smallMax:14,clutterLo:18,clutterHi:24,lineThick:3,lineSpan:.9,rimShare:.7,rimSpan:.5,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3};function l(e,t,n){for(let n=0;n<6;n++){let r=n;for(let t=n+1;t<6;t++)Math.abs(e[t*6+n])>Math.abs(e[r*6+n])&&(r=t);if(Math.abs(e[r*6+n])<1e-12)return!1;if(r!==n){for(let t=0;t<6;t++){let i=e[n*6+t];e[n*6+t]=e[r*6+t],e[r*6+t]=i}let i=t[n];t[n]=t[r],t[r]=i}for(let r=n+1;r<6;r++){let i=e[r*6+n]/e[n*6+n];if(i!==0){for(let t=n;t<6;t++)e[r*6+t]-=i*e[n*6+t];t[r]-=i*t[n]}}}for(let r=5;r>=0;r--){let i=t[r];for(let t=r+1;t<6;t++)i-=e[r*6+t]*n[t];n[r]=i/e[r*6+r]}return!0}function u(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const d=c.abWeight*c.abWeight,f=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n,p=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n;function m(e,t,n,r,i,a,o,s,f){let m=i*a;o.fill(0,0,m),s?.fill(0),f?.fill(1,0,m);let g=c.step,_=Math.ceil(i/g),v=Math.ceil(a/g),y=_*v,b=new Float32Array(y),x=new Float32Array(y),S=new Float32Array(y),C=new Float32Array(y),ee=new Float32Array(y),te=new Float32Array(y),ne=0;for(let o=0,s=0;o<v;o++)for(let c=0;c<_;c++,s++){let l=Math.min(i-1,c*g),u=Math.min(a-1,o*g),d=u*i+l;b[s]=(l+.5)/i-.5,x[s]=(u+.5)/a-.5,S[s]=e[d],C[s]=t[d],ee[s]=n[d],te[s]=r[d],ne+=te[s]}if(ne<y*.3)return 0;let re=new Float32Array(y).fill(1),w=new Float32Array(y),T=new Float64Array(36),E=new Float64Array(36),ie=new Float64Array(6),D=new Float64Array(6),ae=new Float64Array(6),oe=new Float64Array(6),se=new Float64Array(6),ce=new Float64Array(6),O=new Float64Array(6),le=new Float64Array(6),ue=new Uint32Array(256),k=.05;for(let e=0;e<c.iterations;e++){T.fill(0),ie.fill(0),D.fill(0),ae.fill(0);for(let e=0;e<y;e++){let t=te[e]*re[e];if(t<=1e-6)continue;let n=b[e],r=x[e];le[0]=1,le[1]=n,le[2]=r,le[3]=n*n,le[4]=n*r,le[5]=r*r;for(let n=0;n<6;n++){let r=le[n]*t;for(let e=n;e<6;e++)T[n*6+e]+=r*le[e];ie[n]+=r*S[e],D[n]+=r*C[e],ae[n]+=r*ee[e]}}for(let e=0;e<6;e++)for(let t=0;t<e;t++)T[e*6+t]=T[t*6+e];if(E.set(T),oe.set(ie),!l(E,oe,se)||(E.set(T),oe.set(D),!l(E,oe,ce))||(E.set(T),oe.set(ae),!l(E,oe,O)))return 0;ue.fill(0);let e=0;for(let t=0;t<y;t++){let n=b[t],r=x[t],i=S[t]-p(se,n,r),a=C[t]-p(ce,n,r),o=ee[t]-p(O,n,r),s=Math.sqrt(i*i+d*(a*a+o*o));w[t]=s,te[t]>.5&&(ue[Math.min(255,s*1e3|0)]++,e++)}if(e<50)return 0;let t=0,n=0;for(;n<256&&(t+=ue[n],!(t*2>=e));n++);k=Math.max(.004,1.4826*(n+.5)/1e3);for(let e=0;e<y;e++){let t=w[e]/(2.5*k);re[e]=1/(1+t*t)}}let de=Math.min(c.devLo,c.inlierK*k),fe=0;for(let e=0;e<y;e++)w[e]<de&&fe++;let pe=u(c.inlierLo,c.inlierHi,fe/y)*(1-u(c.rmsLo,c.rmsHi,k));if(pe<=0)return 0;if(s)for(let e=0;e<6;e++)s[e]=se[e],s[6+e]=ce[e],s[12+e]=O[e];for(let r=0;r<a;r++){let s=(r+.5)/a-.5;for(let a=0;a<i;a++){let l=(a+.5)/i-.5,m=r*i+a,h=e[m]-p(se,l,s),g=h>0?h:h*c.darkWeight,_=t[m]-p(ce,l,s),v=n[m]-p(O,l,s),y=d*(_*_+v*v);if(o[m]=Math.sqrt(g*g+y),f){let e=h>0?h:h*c.vetoDark;f[m]=u(c.vetoLo,c.vetoHi,Math.sqrt(e*e+y))}}}let me=new Float32Array(m),he=new Float32Array(m);for(let e=1;e<a-1;e++)for(let t=1;t<i-1;t++){let n=e*i+t,r=o[n+1]-o[n-1],a=o[n+i]-o[n-i];me[n]=.5*Math.sqrt(r*r+a*a)}h(me,he,i,a,c.edgeRadius);let A=new Int32Array(m).fill(-1),ge=new Int32Array(m);for(let e=0;e<m;e++){if(A[e]>=0||o[e]<c.devLo)continue;let t=0,n=0;for(ge[t++]=e,A[e]=e;t>0;){let r=ge[--t];he[r]>n&&(n=he[r]);let a=r%i;a>0&&A[r-1]<0&&o[r-1]>=c.devLo&&(A[r-1]=e,ge[t++]=r-1),a<i-1&&A[r+1]<0&&o[r+1]>=c.devLo&&(A[r+1]=e,ge[t++]=r+1),r>=i&&A[r-i]<0&&o[r-i]>=c.devLo&&(A[r-i]=e,ge[t++]=r-i),r<m-i&&A[r+i]<0&&o[r+i]>=c.devLo&&(A[r+i]=e,ge[t++]=r+i)}me[e]=n}for(let e=0;e<m;e++){let t=A[e]>=0?Math.max(he[e],me[A[e]]):he[e];o[e]=pe*u(c.devLo,c.devHi,o[e])*u(c.edgeLo,c.edgeHi,t)}return pe}function h(e,t,n,r,i){let a=new Float32Array(n*r),o=(e,t,n,r,a,o)=>{let s=2*i+1,c=new Float32Array(n+s),l=new Float32Array(n+s);for(let u=0;u<r;u++){let r=u*a,d=t=>{let a=t-i;return a<0||a>=n?0:e[r+a*o]},f=n+2*i;for(let e=0;e<f;e++)c[e]=e%s===0?d(e):Math.max(c[e-1],d(e));for(let e=f-1;e>=0;e--)l[e]=e===f-1||(e+1)%s===0?d(e):Math.max(l[e+1],d(e));for(let e=0;e<n;e++)t[r+e*o]=Math.max(l[e],c[e+2*i])}};o(e,a,n,r,n,1),o(a,t,r,n,1,n)}function g(e,t,n,r,i,a,o=c.vetoLo,s=c.vetoHi){return u(o,s,v(e,t,n,r,i,a))}function _(e,t,n){let r=e-.5,i=t-.5;return n[0]+n[1]*r+n[2]*i+n[3]*r*r+n[4]*r*i+n[5]*i*i}function v(e,t,n,r,i,a){let o=r-.5,s=i-.5,l=e=>a[e]+a[e+1]*o+a[e+2]*s+a[e+3]*o*o+a[e+4]*o*s+a[e+5]*s*s,u=e-l(0),f=u>0?u:u*c.vetoDark,p=t-l(6),m=n-l(12);return Math.sqrt(f*f+d*(p*p+m*m))}const y={minPx:10,maxArea:.5,splitPx:60};function b(e,t,n,r,i,a,o,s){let c=0,l=0,u=0,d=n,f=0,p=r,m=0;for(let r=0;r<t;r++){let t=e[r],a=t%n,o=(t-a)/n;c+=a,l+=o,u+=i[t],a<d&&(d=a),a>f&&(f=a),o<p&&(p=o),o>m&&(m=o)}let h=c/t,g=l/t,_=f-d>=m-p,v=i=>{let a=0,o=0,s=0;for(let r=0;r<t;r++){let t=e[r],c=t%n,l=(t-c)/n;i&&Math.sign(_?c-h:l-g)!==i||(a+=c,o+=l,s++)}if(!s)return null;a/=s,o/=s;let c=0,l=0,u=1/0;for(let r=0;r<t;r++){let t=e[r],s=t%n,d=(t-s)/n;if(i&&Math.sign(_?s-h:d-g)!==i)continue;let f=(s-a)**2+(d-o)**2;f<u&&(u=f,c=s,l=d)}return[(c+.5)/n,(l+.5)/r]},b=v(0),x=[b];if(t>=y.splitPx)for(let e of[-1,1]){let t=v(e);t&&x.push(t)}return{u:b[0],v:b[1],pts:x,x0:d/n,y0:p/r,x1:(f+1)/n,y1:(m+1)/r,area:t/(n*r),dev:u/t,accept:a,seeded:o,bubble:s}}function x(e,t,n,r,i,a,o,s,l,d,p,m,g,_,v){let x=r*i;if(a.fill(0,0,x),v?.fill(0,0,x),n<=0)return 0;let ee=v?u(c.smallValidLo,c.smallValidHi,n):0,te=[],ne=0,re=new Uint8Array(x);for(let e of d??[]){let t=Math.round(e.u*r-.5),n=Math.round(e.v*i-.5),a=c.seedR;for(let e=Math.max(0,n-a);e<=Math.min(i-1,n+a);e++)for(let n=Math.max(0,t-a);n<=Math.min(r-1,t+a);n++)re[e*r+n]=1}let w=null;if(l){let e=new Float32Array(x);for(let t=0;t<x;t++)e[t]=+(l[t]<.5);w=new Float32Array(x),h(e,w,r,i,c.farMargin)}let T=0,E=new Int32Array(x).fill(-1),ie=new Int32Array(x),D=new Int32Array(x),ae=new Uint8Array(x),oe=c.seedFrac*n,se=e=>{let n=e%r,i=(n<r-1?t[e+1]:t[e])-(n>0?t[e-1]:t[e]),a=(e<x-r?t[e+r]:t[e])-(e>=r?t[e-r]:t[e]);return .5*Math.sqrt(i*i+a*a)};for(let n=0;n<x;n++){if(E[n]>=0||w&&w[n]>0||e[n]<oe&&t[n]<c.growDev)continue;let l=0,d=0,h=!1,ce=0,O=0,le=!1,ue=r,k=0,de=i,fe=0,pe=0,me=0,he=0,A=0;for(ie[l++]=n,E[n]=n;l>0;){let a=ie[--l];D[d++]=a;{let e=a%r,n=(a-e)/r;e<ue&&(ue=e),e>k&&(k=e),n<de&&(de=n),n>fe&&(fe=n),pe+=t[a],n<c.lineThick&&me++,e<c.lineThick&&he++,e>=r-c.lineThick&&A++}if(e[a]>=oe&&(h=!0),re[a]&&(le=!0),o&&s){let e=(a%r+.5)/r-.5,t=(Math.floor(a/r)+.5)/i-.5;o[a]-f(s,e,t)>c.lightDL&&O++}let u=se(a);u>ce&&(ce=u);let p=a%r,m=[p>0?a-1:-1,p<r-1?a+1:-1,a>=r?a-r:-1,a<x-r?a+r:-1];for(let r of m)r>=0&&E[r]<0&&!(w&&w[r]>0)&&(t[r]>=c.growDev||e[r]>=oe)&&(E[r]=n,ie[l++]=r)}let ge=h?1:u(c.growEdgeLo,c.growEdgeHi,ce),_e=k-ue+1,ve=fe-de+1;(_e>c.lineSpan*r&&ve<=c.lineThick||ve>c.lineSpan*i&&_e<=c.lineThick)&&(ge=0),(me>=c.rimShare*d&&_e>c.rimSpan*r||Math.max(he,A)>=c.rimShare*d&&ve>c.rimSpan*i)&&(ge=0);{let e=0;for(let t=0;t<d;t++)D[t]>=x-r&&e++;ge*=1-u(c.bottomLo,c.bottomHi,e/r)}if(w){let e=0,t=0;for(let i=0;i<d;i++){let a=D[i],o=a%r,s=[o>0?a-1:-1,o<r-1?a+1:-1,a>=r?a-r:-1,a<x-r?a+r:-1];for(let r of s)r>=0&&E[r]!==n&&(e++,w[r]>0&&t++)}ge*=1-u(c.farShareLo,c.farShareHi,t/Math.max(1,e))}let ye=o&&s&&p&&m?S(D,d,E,n,r,i,o,p,m,s,t):null;if(ye&&g){let e=C(ye);if(e>0)for(let t=0;t<d;t++)g[D[t]]=e}let j=o&&s?u(c.lightShareLo,c.lightShareHi,O/d):1;if(T=Math.max(T,j*ge*u(c.minArea,2*c.minArea,d/x)),v&&ee>0&&h&&!le&&d/x<2*c.minArea){let n=ge*ee*u(c.smallLo,c.smallHi,d/x)*u(c.smallDevLo,c.smallDevHi,pe/d)*(1-(ye?C(ye):0));if(n>0){let r=new Float32Array(d);for(let e=0;e<d;e++)r[e]=t[D[e]];r.sort();let i=c.relKeep*r[Math.min(d-1,Math.floor(.9*d))];te.push({cells:D.slice(0,d).filter(n=>t[n]>=i||e[n]>=oe),k:n,lit:j})}}d>=y.minPx&&ne++,_&&d>=y.minPx&&d/x<=y.maxArea&&_.push(b(D,d,r,i,t,ge,h,ye?C(ye):0));let M=le?+(d/x>=.25*c.minArea):ge*u(1.5*c.minArea,2*c.minArea,d/x);if(M<=0)continue;ae[n]=le?2:1;let be=new Float32Array(d);for(let e=0;e<d;e++)be[e]=t[D[e]];be.sort();let N=c.relKeep*be[Math.min(d-1,Math.floor(.9*d))];for(let n=0;n<d;n++)(t[D[n]]>=N||e[D[n]]>=oe)&&(a[D[n]]=M)}let ce=new Float32Array(x);h(a,ce,r,i,c.closeR);for(let e=0;e<x;e++)ce[e]=1-ce[e];h(ce,a,r,i,c.closeR);for(let e=0;e<x;e++)a[e]=1-a[e];let O=new Uint8Array(x);for(let e=0;e<x;e++){if(O[e]||a[e]<=0)continue;let n=0,i=0,o=0,s=new Set;for(ie[n++]=e,O[e]=1;n>0;){let e=ie[--n];D[i++]=e,E[e]>=0&&ae[E[e]]&&s.add(E[e]),t[e]>=c.solidDev&&o++;let l=e%r;for(let t=-1;t<=1;t++)for(let i=-1;i<=1;i++){let o=l+i,s=e+t*r+i;(i|t)===0||o<0||o>=r||s<0||s>=x||O[s]||a[s]<=0||(O[s]=1,ie[n++]=s)}}let l=!1;for(let e of s)ae[e]===2&&(l=!0);let d=l?1:s.size>=c.schoolN?0:u(c.solidLo,c.solidHi,o/i);if(d<1&&v&&!l&&s.size<c.schoolN){let e=0;for(let n=0;n<i;n++)e+=t[D[n]];let n=u(c.strongDevLo,c.strongDevHi,e/i);if(n>d)for(let e=0;e<i;e++)v[D[e]]=Math.max(v[D[e]],a[D[e]]*n)}if(d<1)for(let e=0;e<i;e++)a[D[e]]*=d}let le=1-u(c.clutterLo,c.clutterHi,ne);if(v&&te.length&&te.length<=c.smallMax&&le>0)for(let e of te){let t=e.k*le;for(let n of e.cells)t>a[n]&&t>v[n]&&(v[n]=t);T=Math.max(T,e.lit*t)}return T}function S(e,t,n,r,i,a,o,s,c,l,u){let d=i*a,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=i,S=0,C=a,ee=0;for(let te=0;te<t;te++){let t=e[te],ne=t%i,re=(t-ne)/i;y+=ne,b+=re,x=Math.min(x,ne),S=Math.max(S,ne),C=Math.min(C,re),ee=Math.max(ee,re);let w=(ne+.5)/i-.5,T=(re+.5)/a-.5,E=l[6]+l[7]*w+l[8]*T+l[9]*w*w+l[10]*w*T+l[11]*T*T,ie=l[12]+l[13]*w+l[14]*T+l[15]*w*w+l[16]*w*T+l[17]*T*T;h+=o[t]-f(l,w,T),g+=Math.hypot(s[t],c[t])/Math.max(.001,Math.hypot(E,ie));let D=ne>0&&re>0&&ne<i-1&&re<a-1;if(D&&n[t-1]===r&&n[t+1]===r&&n[t-i]===r&&n[t+i]===r)p+=Math.hypot(o[t+1]-o[t-1],o[t+i]-o[t-i])*.5,m++;else if(D){let e=0;for(let n=1;n<=2;n++)for(let r of[t-n,t+n,t-n*i,t+n*i])r>=0&&r<d&&(e=Math.max(e,Math.abs(u[t]-u[r])/n));_+=e,v++}}return{tex:m?p/m:0,dL:h/t,cr:g/t,aspect:(ee-C+1)/(S-x+1),sharp:v?_/v:0,cx:y/t,cy:b/t}}function C(e){return(1-u(c.bubbleTexLo,c.bubbleTexHi,e.tex))*u(c.bubbleCrLo,c.bubbleCrHi,e.cr)*u(c.bubbleDLLo,c.bubbleDLHi,e.dL)*u(c.bubbleTallLo,c.bubbleTallHi,e.aspect)}function ee(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function te(e){return e<=0?0:e>=1?1:e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}const ne=(()=>{let e=new Float32Array(256);for(let t=0;t<256;t++)e[t]=ee(t/255);return e})();function re(e,t,n){return .2126*e+.7152*t+.0722*n}const w=Math.cbrt;function T(e,t,n){let r=w(.4122214708*e+.5363325363*t+.0514459929*n),i=w(.2119034982*e+.6806995451*t+.1073969566*n),a=w(.0883024619*e+.2817188376*t+.6299787005*n);return[.2104542553*r+.793617785*i-.0040720468*a,1.9779984951*r-2.428592205*i+.4505937099*a,.0259040371*r+.7827717662*i-.808675766*a]}function E(e,t,n){let r=e+.3963377774*t+.2158037573*n,i=e-.1055613458*t-.0638541728*n,a=e-.0894841775*t-1.291485548*n,o=r*r*r,s=i*i*i,c=a*a*a;return[4.0767416621*o-3.3077115913*s+.2309699292*c,-1.2684380046*o+2.6097574011*s-.3413193965*c,-.0041960863*o-.7034186147*s+1.707614701*c]}function ie(e,t){let n=Math.atan2(t,e)*180/Math.PI;return n<0?n+360:n}const D=.7,ae=.7,oe=.94;function se(e){return e[0]>=0&&e[1]>=0&&e[2]>=0&&e[0]<=1&&e[1]<=1&&e[2]<=1}function ce(e,t,n){let r=0,i=.4;for(let a=0;a<10;a++){let a=.5*(r+i);se(E(e,t*a,n*a))?r=a:i=a}return r}function O(e,t,n,r=0){let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=t/i,o=n/i,s=ce(e,a,o),c=ae*s;if(i<=c||s<=1e-5)return[t,n];let l=oe*s-c,u=Math.min(i,r,oe*s),d=Math.max(u,c+l*(1-Math.exp(-(i-c)/l)));return[a*d,o*d]}function le(e,t,n){let r=Math.max(e,t,n);if(r>1){let i=Math.max(D,1/r);e*=i,t*=i,n*=i}return ue(e,t,n)}function ue(e,t,n){let r=Math.min(1,Math.max(0,re(e,t,n))),i=1,a=[e,t,n];for(let e=0;e<3;e++){let t=a[e];t>1?i=Math.min(i,(1-r)/(t-r)):t<0&&(i=Math.min(i,(0-r)/(t-r)))}return i>=1?[e,t,n]:(i=Math.max(0,i),[r+i*(e-r),r+i*(t-r),r+i*(n-r)])}const k={hueLo:-30*Math.PI/180,hueHi:70*Math.PI/180,warmC:.06,warmL:.2,warmLo:.012,warmHi:.05,rgY:.15,rgLo:.78,rgHi:.95,bgLo0:.45,bgLo1:.6,bgHi0:1.25,bgHi1:1.5,floorLo:.15,floorHi:.3,floorMin:.015,floorWarmLo:1.05,floorWarmHi:1.2,floorMagentaLo:.85,floorMagentaHi:1,hazeLo:.2,hazeHi:.35,redToneLo:.06,redToneHi:.12,colourMax:.9,toneMax:.9,toneLookOff:.4,knee:.97};function de(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const fe=1024,pe={rg:new Uint32Array(fe),bg:new Uint32Array(fe),r:new Uint32Array(fe),g:new Uint32Array(fe),b:new Uint32Array(fe)},me=.25;function he(e,t){return Math.min(fe-1,Math.max(0,fe/t*e|0))}function A(e,t,n,r){let i=n*t,a=0;for(let t=0;t<fe;t++)if(a+=e[t],a>=i)return(t+.5)*r/fe;return r}function ge(e,t){for(let e of Object.values(pe))e.fill(0);let n=0,r=0,i=0,a=(k.hueLo+k.hueHi)/2,o=Math.cos(a),s=Math.sin(a),c=Math.cos((k.hueHi-k.hueLo)/2);for(let a=0;a<t;a+=3){let t=e[a*3],l=e[a*3+1],u=e[a*3+2];if(r++,pe.r[he(t,me)]++,pe.g[he(l,me)]++,pe.b[he(u,me)]++,.2126*t+.7152*l+.0722*u>=k.rgY){let e=1/Math.max(1e-4,l);pe.rg[he(t*e,4)]++,pe.bg[he(u*e,4)]++,i++}if(t<=l*.9)continue;let[d,f,p]=T(t,l,u),m=Math.hypot(f,p);d>=k.warmL&&m>=k.warmC&&(f*o+p*s)/m>=c&&n++}let l=n/Math.max(1,r),u=i>=r*.02,d=u?A(pe.rg,i,.5,4):0,f=u?A(pe.bg,i,.5,4):0,p=A(pe.r,r,.02,me),m=Math.max(A(pe.g,r,.02,me),A(pe.b,r,.02,me)),h=m<k.floorMin?1:p/m,g=de(k.rgLo,k.rgHi,d)*de(k.bgLo0,k.bgLo1,f)*(1-de(k.bgHi0,k.bgHi1,f))*de(k.floorLo,k.floorHi,h)*(1-de(k.floorWarmLo,k.floorWarmHi,h)*de(k.floorMagentaLo,k.floorMagentaHi,f));return{warm:l,rg:d,bg:f,floor:h,reds:de(k.warmLo,k.warmHi,l),noCast:g}}function _e(e,t){let n=1-de(k.hazeLo,k.hazeHi,t),r=e.noCast*n,i=de(k.redToneLo,k.redToneHi,e.warm)*n;return{calm:k.colourMax*Math.max(e.reds,r),calmTone:k.toneMax*Math.max(r,i)}}function ve(e){let t=Math.min(1,Math.max(0,e.calm??0)),n=Math.min(1,Math.max(0,e.calmTone??0));if(t<=0&&n<=0)return e;let r=e=>Math.max(1e-4,e)**(1-t),i=1-n;return{...e,wb:e.wb.map(r),waterWb:e.waterWb.map(r),attn:e.attn.map(e=>e*(1-t)),binf:e.binf.map(e=>e*(1-t)),exposure:Math.max(1e-4,e.exposure)**+i,levelsMix:e.levelsMix*i,toneGamma:1+((e.toneGamma??1)-1)*(1-Math.min(1,Math.max(t/k.colourMax,n/k.toneMax)/k.toneLookOff)),haze:e.haze*i,hazeBlack:e.hazeBlack*i,hazeFloor:e.hazeFloor.map(e=>e*i),knee:e.knee+(Math.max(e.knee,k.knee)-e.knee)*n}}function ye(e,t){let n=Math.min(1,Math.max(0,t.calmTone??0));return n<=0?e:{...e,clarity:e.clarity*(1-n),dehaze:e.dehaze*(1-n)}}const j=Math.PI/180,M={sigma:2,gainLo:1.25,gainHi:2,keepLo:15,keepHi:40,tolFrac:.35,tolLin:.004,snrLo:1.5,snrHi:6,snrMin:.25,waterRed:.8,waterSnrLo:4,waterSnrHi:12,hue:15*j,bandIn:35*j,bandOut:60*j,cMax:.15,knee:.65,pinkHue:5*j,pinkIn:40*j,pinkOut:60*j,whiteLo:.55,whiteHi:.78,whiteC:.015,magHue:335*j,magIn:35*j,magOut:55*j,magLLo:.35,magLHi:.5,magDir:45*j,magSrcLo:-.008,magSrcHi:.004,magCLo:.05,magCHi:.12,skinHueMin:15*j,skinCMax:.085,skinSrcCLo:.07,skinSrcCHi:.11,greenLo:1.15,greenHi:1.8,greenRMax:5,greenBMax:3,greenWater:.7,greenDehaze:.85,greenObj:.9,greenProp:.6,greenWarmR:1.1,greenWarmB:.9,veilGreenLo:1.35,veilGreenHi:1.85,veilChromaLo:.03,veilChromaHi:.06,greenLevelLo:.03,greenLevelHi:.08,gnHue:150*j,gnIn:20*j,gnOut:45*j,gnMix:.75,gnObjKeep:.7,gnTargetHue:240*j,gnTargetC:.012,matHue:70*j,matIn:40*j,matOut:65*j,matC:.05,matKnee:.6,litLo:.35,litHi:.55,litSub:3,murkHold:1,murkDark:.75,murkLo:.08,murkHi:.25};function be(e,t,n){return e<t?t:e>n?n:e}function N(e,t,n){let r=be((n-e)/(t-e),0,1);return r*r*(3-2*r)}function xe(e,t){return we(e,t)*(1-Ce(t))}function Se(e,t){return we(e,t)*Ce(t)}function Ce(e){return e?N(M.litLo,M.litHi,.2126*e[0]+.7152*e[1]+.0722*e[2]):0}function we(e,t){let n=N(M.greenLo,M.greenHi,e[1]/Math.max(1e-4,e[2])),r=t?N(M.veilGreenLo,M.veilGreenHi,t[1]/Math.max(1e-4,t[2]))*N(M.veilChromaLo,M.veilChromaHi,Te(t)):0;return Math.max(n,r)*N(M.greenLevelLo,M.greenLevelHi,e[1])}function Te(e){let[,t,n]=T(Math.max(0,e[0]),Math.max(0,e[1]),Math.max(0,e[2]));return Math.hypot(t,n)}function Ee(e){return xe(e.binf,e.veilColor)*(1-Math.min(1,Math.max(0,e.calm??0)))}function De(e,t){let n=M.greenDehaze*Ee(t);return n>e.dehaze?{...e,dehaze:Math.min(1,n)}:e}function Oe(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=N(Math.cos(M.gnOut),Math.cos(M.gnIn),(t*Math.cos(M.gnHue)+n*Math.sin(M.gnHue))/i),o=M.gnMix*r*a,s=M.gnTargetC*be(e/.6,0,1.3);return[t+(s*Math.cos(M.gnTargetHue)-t)*o,n+(s*Math.sin(M.gnTargetHue)-n)*o]}function ke(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of y){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*.12*.12));h+=f*c,g+=f*l,_+=f*u,v+=f}if(v<1e-6)return[r,i,a];let b=Math.min(1,v/.08);return[r+(h/v-r)*b,i+(g/v-i)*b,a+(_/v-a)*b]}function Ae(e,t){return 255*Math.max(0,te(Math.max(0,e))-te(Math.max(0,Math.min(e,t))))/M.sigma}function je(e,t,n,r){let i=[0,0,0],a=0;for(let e=0;e<3;e++){let o=Ae(t[e],r[e]);e===0&&(a=o),i[e]=N(M.gainLo,M.gainHi,n[e]/Math.max(1e-4,n[1]))*(1-N(M.keepLo,M.keepHi,o))}let o=[.2126,.7152,.0722],s=0,c=0;for(let n=0;n<3;n++){let r=o[n]*(1-.95*i[n]);s+=r*e[n],c+=r*t[n]}let l=c>1e-6?s/c:1,u=[e[0],e[1],e[2]];for(let n=0;n<3;n++){let r=M.tolFrac*e[n]+M.tolLin,a=be(t[n]*l,e[n]-r,e[n]+r);u[n]=e[n]+(a-e[n])*i[n]}return{c:u,snrR:a}}function Me(e,t,n){let r=M.waterRed*N(M.waterSnrLo,M.waterSnrHi,n);return e*Math.max(1,t/Math.max(1e-4,e))**+r}function Ne(e,t,n,r,i){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=M.matKnee*M.matC;if(a<=o)return[t,n];let s=N(Math.cos(M.matOut),Math.cos(M.matIn),(t*Math.cos(M.matHue)+n*Math.sin(M.matHue))/a),c=r*(1-i)*s*N(.2,.3,e)*(1-N(.85,.95,e));if(c<=0)return[t,n];let l=M.matC-o,u=a+(o+l*(1-Math.exp(-(a-o)/l))-a)*c;return[t*u/a,n*u/a]}function Pe(e,t,n){let r=t*(M.murkDark+(1-M.murkDark)*N(M.murkLo,M.murkHi,t));return n<=0||e<=r?e:e+(r-e)*n*M.murkHold}function Fe(e){return M.snrMin+(1-M.snrMin)*N(M.snrLo,M.snrHi,e)}function Ie(e,t,n,r,i,a,o){let s=Math.hypot(t,n);if(s<1e-5)return[t,n];let c=N(Math.cos(M.bandOut),Math.cos(M.bandIn),(t*Math.cos(M.hue)+n*Math.sin(M.hue))/s),l=N(Math.cos(M.pinkOut),Math.cos(M.pinkIn),(t*Math.cos(M.pinkHue)+n*Math.sin(M.pinkHue))/s),u=Math.hypot(r,i),d=N(.1,.5,a)*(1-N(M.skinSrcCLo,M.skinSrcCHi,u))*(1-o)*N(.3,.45,e),f=Math.atan2(n,t);if(d>0){let e=f<M.skinHueMin&&f>-Math.PI/2?M.skinHueMin:f;f+=(e-f)*d}let p=M.cMax+(M.whiteC-M.cMax)*N(M.whiteLo,M.whiteHi,e)*l*(1-d),m=N(Math.cos(M.magOut),Math.cos(M.magIn),(t*Math.cos(M.magHue)+n*Math.sin(M.magHue))/s)*(1-N(M.magSrcLo,M.magSrcHi,r*Math.cos(M.magDir)+i*Math.sin(M.magDir)))*N(M.magLLo,M.magLHi,e)*(1-N(M.magCLo,M.magCHi,s))*(1-d);p=Math.min(p,M.cMax+(M.whiteC-M.cMax)*m),p+=(Math.min(p,M.skinCMax)-p)*d;let h=u>1e-5?(r*Math.cos(M.hue)+i*Math.sin(M.hue))/u:0,g=u*N(Math.cos(M.bandOut),Math.cos(M.bandIn),h);p=Math.max(p,g);let _=Math.max(c,l,d,m),v=Math.max(M.knee*p,g),y=s;if(y>v&&_>0){let e=p-v,t=v+e*(1-Math.exp(-(y-v)/Math.max(1e-6,e)));y+=(t-y)*_}return y===s&&d<=0?[t,n]:[y*Math.cos(f),y*Math.sin(f)]}const Le=`
const float RED_SIGMA = ${M.sigma.toFixed(4)};
const float RED_GAIN_LO = ${M.gainLo.toFixed(4)};
const float RED_GAIN_HI = ${M.gainHi.toFixed(4)};
const float RED_KEEP_LO = ${M.keepLo.toFixed(4)};
const float RED_KEEP_HI = ${M.keepHi.toFixed(4)};
const float RED_TOL_FRAC = ${M.tolFrac.toFixed(4)};
const float RED_TOL_LIN = ${M.tolLin.toFixed(5)};
const float RED_SNR_LO = ${M.snrLo.toFixed(4)};
const float RED_SNR_HI = ${M.snrHi.toFixed(4)};
const float RED_SNR_MIN = ${M.snrMin.toFixed(4)};
const float RED_WATER_RED = ${M.waterRed.toFixed(4)};
const float RED_WATER_SNR_LO = ${M.waterSnrLo.toFixed(4)};
const float RED_WATER_SNR_HI = ${M.waterSnrHi.toFixed(4)};
const float RED_HUE_COS = ${Math.cos(M.hue).toFixed(6)};
const float RED_HUE_SIN = ${Math.sin(M.hue).toFixed(6)};
const float RED_COS_IN = ${Math.cos(M.bandIn).toFixed(6)};
const float RED_COS_OUT = ${Math.cos(M.bandOut).toFixed(6)};
const float RED_PINK_COS = ${Math.cos(M.pinkHue).toFixed(6)};
const float RED_PINK_SIN = ${Math.sin(M.pinkHue).toFixed(6)};
const float RED_PINK_COS_IN = ${Math.cos(M.pinkIn).toFixed(6)};
const float RED_PINK_COS_OUT = ${Math.cos(M.pinkOut).toFixed(6)};
const float RED_MAG_COS = ${Math.cos(M.magHue).toFixed(6)};
const float RED_MAG_SIN = ${Math.sin(M.magHue).toFixed(6)};
const float RED_MAG_COS_IN = ${Math.cos(M.magIn).toFixed(6)};
const float RED_MAG_COS_OUT = ${Math.cos(M.magOut).toFixed(6)};
const float RED_MAG_L_LO = ${M.magLLo.toFixed(4)};
const float RED_MAG_L_HI = ${M.magLHi.toFixed(4)};
const float RED_MAG_DIR_COS = ${Math.cos(M.magDir).toFixed(6)};
const float RED_MAG_DIR_SIN = ${Math.sin(M.magDir).toFixed(6)};
const float RED_MAG_SRC_LO = ${M.magSrcLo.toFixed(4)};
const float RED_MAG_SRC_HI = ${M.magSrcHi.toFixed(4)};
const float RED_MAG_C_LO = ${M.magCLo.toFixed(4)};
const float RED_MAG_C_HI = ${M.magCHi.toFixed(4)};
const float RED_C_MAX = ${M.cMax.toFixed(4)};
const float RED_KNEE = ${M.knee.toFixed(4)};
const float RED_WHITE_LO = ${M.whiteLo.toFixed(4)};
const float RED_WHITE_HI = ${M.whiteHi.toFixed(4)};
const float RED_WHITE_C = ${M.whiteC.toFixed(4)};
const float RED_SKIN_HUE_MIN = ${M.skinHueMin.toFixed(6)};
const float RED_SKIN_C_MAX = ${M.skinCMax.toFixed(4)};
const float RED_SKIN_SRC_C_LO = ${M.skinSrcCLo.toFixed(4)};
const float RED_SKIN_SRC_C_HI = ${M.skinSrcCHi.toFixed(4)};
const float RED_GREEN_PROP = ${M.greenProp.toFixed(4)};
const float RED_GREEN_OBJ = ${M.greenObj.toFixed(4)};
const float RED_MAT_COS = ${Math.cos(M.matHue).toFixed(6)};
const float RED_MAT_SIN = ${Math.sin(M.matHue).toFixed(6)};
const float RED_MAT_COS_IN = ${Math.cos(M.matIn).toFixed(6)};
const float RED_MAT_COS_OUT = ${Math.cos(M.matOut).toFixed(6)};
const float RED_MAT_C = ${M.matC.toFixed(4)};
const float RED_MAT_KNEE = ${M.matKnee.toFixed(4)};
const float RED_MURK_HOLD = ${M.murkHold.toFixed(4)};
const float RED_MURK_DARK = ${M.murkDark.toFixed(4)};
const float RED_MURK_LO = ${M.murkLo.toFixed(4)};
const float RED_MURK_HI = ${M.murkHi.toFixed(4)};
const float RED_GN_COS = ${Math.cos(M.gnHue).toFixed(6)};
const float RED_GN_SIN = ${Math.sin(M.gnHue).toFixed(6)};
const float RED_GN_COS_IN = ${Math.cos(M.gnIn).toFixed(6)};
const float RED_GN_COS_OUT = ${Math.cos(M.gnOut).toFixed(6)};
const float RED_GN_OBJ_KEEP = ${M.gnObjKeep.toFixed(4)};
const float RED_GN_MIX = ${M.gnMix.toFixed(4)};
const float RED_GN_TA = ${(M.gnTargetC*Math.cos(M.gnTargetHue)).toFixed(6)};
const float RED_GN_TB = ${(M.gnTargetC*Math.sin(M.gnTargetHue)).toFixed(6)};
`,Re=Le.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),ze=`${Le}
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
}`,Be=`${Re}
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
}`,Ve=[`sh`,`mid`,`hi`,`rot`,`sat`,`coolSat`,`warmSat`,`satL`,`shA`,`shB`,`hiA`,`hiB`],He={sh:0,mid:0,hi:0,rot:0,sat:0,coolSat:0,warmSat:0,satL:0,shA:0,shB:0,hiA:0,hiB:0};25*Math.PI/180;const P={cool:240*Math.PI/180,coolIn:50*Math.PI/180,coolOut:95*Math.PI/180,warm:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:80*Math.PI/180,protLo:.015,protHi:.05},Ue={vivid:{...He},blue:{...He}},F=e=>Math.min(1,Math.max(0,e));function We(e,t,n){let r=F((n-e)/(t-e));return r*r*(3-2*r)}const Ge=256/27;function Ke(e){let t=F(e),n=1-t;return[Ge*t*n*n*n,16*t*t*n*n,Ge*t*t*t*n]}const qe=(e,t,n)=>{if(n<=0)return e;let r={...e};for(let i of Ve)r[i]=e[i]+(t[i]-e[i])*n;return r};function Je(e,t,n,r,i=0,a=Ue){if(r<=0)return[e,t,n];let o=qe(a.vivid,a.blue,F(i)),s=P,c=F(e),[l,u,d]=Ke(c),f=e+r*(o.sh*l+o.mid*u+o.hi*d),p=Math.hypot(t,n),m=0,h=0;if(p>1e-6){let e=Math.atan2(n,t),r=t=>{let n=e-t;return Math.abs(n-2*Math.PI*Math.round(n/(2*Math.PI)))};m=1-We(s.coolIn,s.coolOut,r(s.cool)),h=1-We(s.warmIn,s.warmOut,r(s.warm))}let g=r*o.rot*m,_=Math.cos(g),v=Math.sin(g),y=Math.max(0,1+r*(o.sat+o.coolSat*m+o.warmSat*h+o.satL*(2*c-1))),b=r*(1-h*We(s.protLo,s.protHi,p));return[f,(t*_-n*v)*y+b*(o.shA*l+o.hiA*d),(t*v+n*_)*y+b*(o.shB*l+o.hiB*d)]}const I=e=>Ve.every(t=>e[t]===0);function Ye(e,t,n=Ue){let r=Ze(t);return r<1&&!I(n.vivid)||r>0&&!I(n.blue)?Xe(e,t):0}function Xe(e,t){let n=F(Math.max(e.calm??0,e.calmTone??0)),r=Ze(t),i=F(e.vividGate??1),a=i+(F(e.blueGate??e.vividGate??1)-i)*r;return F(t.vivid??0)*(1-We(Tt.calmLo,Tt.calmHi,n))*(1-We(It.calmLo,It.calmHi,n))*a}function Ze(e){return F(e.blue??0)}const Qe={hue:45*Math.PI/180,warmIn:60*Math.PI/180,warmOut:100*Math.PI/180,hueKeep:.4,knee:.05,cap:.08,rest:.03,restMix:.5,coolCut:.85,srcLo:.035,srcHi:.065,coolLo:.03,coolHi:.055,lLo:.3,lHi:.45,hiLo:.86,hiHi:.95};function $e(e,t){let n=Qe,r=Math.hypot(e,t);return r<1e-6?0:We(n.srcLo,n.srcHi,r)*(1-We(Math.cos(n.warmOut),Math.cos(n.warmIn),(e*Math.cos(n.hue)+t*Math.sin(n.hue))/r))}function et(e,t,n,r,i,a=0){if(r<=0&&i<=0)return[t,n];let o=Qe,s=Math.cos(o.hue),c=Math.sin(o.hue),l=Math.hypot(t,n),u=t*s+n*c,d=n*s-t*c,f=l>1e-6?We(Math.cos(o.warmOut),Math.cos(o.warmIn),u/l):0,p=F(r)*f;d*=1-(1-o.hueKeep)*p;let m=Math.hypot(u,d),h=1-o.coolCut*F(a),g=o.knee*h,_=(o.cap-o.knee)*h;if(m>g){let e=1+((g+_*(1-Math.exp(-(m-g)/_)))/m-1)*p;u*=e,d*=e}let v=F(i)*o.restMix*We(o.lLo,o.lHi,e)*(1-We(o.hiLo,o.hiHi,e))*(1-We(o.coolLo,o.coolHi,l));return u+=(Math.max(u,o.rest)-u)*v,d*=1-v,[u*s-d*c,u*c+d*s]}const L=e=>{let t=e.toFixed(7).replace(/0+$/,``);return t.endsWith(`.`)?t+`0`:t},tt=e=>t=>`mix(${L(e.vivid[t])}, ${L(e.blue[t])}, m)`,nt=P,R=Qe;function rt(e=Ue){let t=tt(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
float fitLookDist(float h, float h0) { float d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
vec3 fitLook(vec3 lab, float t, float m) {
  if (t <= 0.0) return lab;
  float x = clamp(lab.x, 0.0, 1.0), y = 1.0 - x;
  float S = ${L(Ge)} * x * y * y * y, M = 16.0 * x * x * y * y, H = ${L(Ge)} * x * x * x * y;
  float L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  float C = length(lab.yz);
  float cool = 0.0, warm = 0.0;
  if (C > 1e-6) {
    float h = atan(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${L(nt.coolIn)}, ${L(nt.coolOut)}, fitLookDist(h, ${L(nt.cool)}));
    warm = 1.0 - smoothstepf(${L(nt.warmIn)}, ${L(nt.warmOut)}, fitLookDist(h, ${L(nt.warm)}));
  }
  float ang = t * ${t(`rot`)} * cool, cs = cos(ang), sn = sin(ang);
  float k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  float tw = t * (1.0 - warm * smoothstepf(${L(nt.protLo)}, ${L(nt.protHi)}, C));
  return vec3(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
float skinGuardCool(vec2 ab0) {
  float C = length(ab0);
  if (C < 1e-6) return 0.0;
  return smoothstepf(${L(R.srcLo)}, ${L(R.srcHi)}, C) * (1.0 - smoothstepf(${L(Math.cos(R.warmOut))}, ${L(Math.cos(R.warmIn))}, dot(ab0, vec2(${L(Math.cos(R.hue))}, ${L(Math.sin(R.hue))})) / C));
}
vec2 skinGuard(vec3 lab, float cap, float rest, float cool) {
  if (cap <= 0.0 && rest <= 0.0) return lab.yz;
  vec2 d = vec2(${L(Math.cos(R.hue))}, ${L(Math.sin(R.hue))});
  float C = length(lab.yz);
  float s = dot(lab.yz, d), o = lab.z * d.x - lab.y * d.y;
  float warm = C > 1e-6 ? smoothstepf(${L(Math.cos(R.warmOut))}, ${L(Math.cos(R.warmIn))}, s / C) : 0.0;
  float kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${L(1-R.hueKeep)} * kw;
  float C1 = length(vec2(s, o));
  float lim = 1.0 - ${L(R.coolCut)} * clamp(cool, 0.0, 1.0), knee = ${L(R.knee)} * lim, room = ${L(R.cap-R.knee)} * lim;
  if (C1 > knee) {
    float q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  float kr = clamp(rest, 0.0, 1.0) * ${L(R.restMix)} * smoothstepf(${L(R.lLo)}, ${L(R.lHi)}, lab.x) * (1.0 - smoothstepf(${L(R.hiLo)}, ${L(R.hiHi)}, lab.x)) * (1.0 - smoothstepf(${L(R.coolLo)}, ${L(R.coolHi)}, C));
  s += (max(s, ${L(R.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2(s * d.x - o * d.y, s * d.y + o * d.x);
}`}function it(e=Ue){let t=tt(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
fn fitLookDist(h: f32, h0: f32) -> f32 { let d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
fn fitLook(lab: vec3<f32>, t: f32, m: f32) -> vec3<f32> {
  if (t <= 0.0) { return lab; }
  let x = clamp(lab.x, 0.0, 1.0);
  let y = 1.0 - x;
  let S = ${L(Ge)} * x * y * y * y;
  let M = 16.0 * x * x * y * y;
  let H = ${L(Ge)} * x * x * x * y;
  let L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  let C = length(lab.yz);
  var cool = 0.0;
  var warm = 0.0;
  if (C > 1e-6) {
    let h = atan2(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${L(nt.coolIn)}, ${L(nt.coolOut)}, fitLookDist(h, ${L(nt.cool)}));
    warm = 1.0 - smoothstepf(${L(nt.warmIn)}, ${L(nt.warmOut)}, fitLookDist(h, ${L(nt.warm)}));
  }
  let ang = t * ${t(`rot`)} * cool;
  let cs = cos(ang);
  let sn = sin(ang);
  let k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  let tw = t * (1.0 - warm * smoothstepf(${L(nt.protLo)}, ${L(nt.protHi)}, C));
  return vec3<f32>(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
fn skinGuardCool(ab0: vec2<f32>) -> f32 {
  let C = length(ab0);
  if (C < 1e-6) { return 0.0; }
  return smoothstepf(${L(R.srcLo)}, ${L(R.srcHi)}, C) * (1.0 - smoothstepf(${L(Math.cos(R.warmOut))}, ${L(Math.cos(R.warmIn))}, dot(ab0, vec2<f32>(${L(Math.cos(R.hue))}, ${L(Math.sin(R.hue))})) / C));
}
fn skinGuard(lab: vec3<f32>, cap: f32, rest: f32, cool: f32) -> vec2<f32> {
  if (cap <= 0.0 && rest <= 0.0) { return lab.yz; }
  let d = vec2<f32>(${L(Math.cos(R.hue))}, ${L(Math.sin(R.hue))});
  let C = length(lab.yz);
  var s = dot(lab.yz, d);
  var o = lab.z * d.x - lab.y * d.y;
  var warm = 0.0;
  if (C > 1e-6) { warm = smoothstepf(${L(Math.cos(R.warmOut))}, ${L(Math.cos(R.warmIn))}, s / C); }
  let kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${L(1-R.hueKeep)} * kw;
  let C1 = length(vec2<f32>(s, o));
  let lim = 1.0 - ${L(R.coolCut)} * clamp(cool, 0.0, 1.0);
  let knee = ${L(R.knee)} * lim;
  let room = ${L(R.cap-R.knee)} * lim;
  if (C1 > knee) {
    let q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  let kr = clamp(rest, 0.0, 1.0) * ${L(R.restMix)} * smoothstepf(${L(R.lLo)}, ${L(R.lHi)}, lab.x) * (1.0 - smoothstepf(${L(R.hiLo)}, ${L(R.hiHi)}, lab.x)) * (1.0 - smoothstepf(${L(R.coolLo)}, ${L(R.coolHi)}, C));
  s += (max(s, ${L(R.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2<f32>(s * d.x - o * d.y, s * d.y + o * d.x);
}`}const at={mu0:.53214829,mu1:.51309827,mu2:-.91066194},ot={auto:{red:1,blue:1,redMax:5,dehaze:0,clarity:0,exposure:1,hazeLift:0},murky:{red:1.1,blue:1.2,redMax:5,dehaze:.65,clarity:.35,exposure:1.1,hazeLift:.9},deep:{red:1.5,blue:.9,redMax:5,dehaze:.25,clarity:.15,exposure:1.05,hazeLift:.5},reef:{red:1,blue:1,redMax:1.6,dehaze:0,clarity:-.1,exposure:.97,hazeLift:0}},st={intensity:1,saturation:1,clarity:.15,veil:.7,look:0,preset:`auto`,subjectPop:!1,subjectPopStrength:.5,subjectPopWarmth:.5,seabed:.6,vivid:0,blue:0,noiseReduction:`auto`},ct={lo:.55,hi:.78},lt={lo:.06,hi:.18},ut={lo:.05,hi:.2},dt={floor:.25,soft:.12,chroma:.7,farKeep:.6};function ft(e,t){if(t<=0||e.hazeBlack<=0)return[0,0,0];let n=dt.chroma;return e.hazeFloor.map(r=>t*((1-n)*e.hazeBlack+n*Math.min(Math.max(r,0),2*e.hazeBlack)))}function pt(e,t){if(t<=0)return 1;let n=(e-t)/((1-t)*Math.max(e,1e-6)),r=n-dt.floor,i=1-dt.floor,a=dt.soft*dt.soft;return .5*(n+dt.floor+Math.sqrt(r*r+a))-.5*(Math.sqrt(i*i+a)-i)}const mt={sigma:.009,k:1/(6*.009*.009),eps:.004,rMin:.5,rMax:2},ht=[[-2.5,-2.5,1],[2.5,-2.5,1],[-2.5,2.5,1],[2.5,2.5,1],[-6.5,-1.5,.7],[6.5,1.5,.7],[-1.5,6.5,.7],[1.5,-6.5,.7],[-6.5,1.5,.7],[6.5,-1.5,.7],[1.5,6.5,.7],[-1.5,-6.5,.7]],gt={k:0,cMax:0,desat:-.4,edgeFloor:0},z={hue:55*Math.PI/180,chroma:.02,keep:.35,lift:.06,grid:6,wLo:.1,wHi:.8,lo:.1,span:.8,redLo:.12,redHi:.35,bandLo:-.1,bandHi:-.02,y0:.2,y1:.5,texLo:.04,texHi:.07},B={hue:65*Math.PI/180,cMin:.026,cMax:.034,keep:.25,lLo:.2,lHi:.55,wLo:.03,wHi:.3,side:4,castLo:.015,castHi:.045,litLo:.3,litHi:.5,upLo:-.03,upHi:.05,floor:.018,floorKeep:.5,engineTone:.35,amount:0},V={vividKeep:.8,clarity:.3,lift:.2,hiLo:.62,hiHi:.9,waterLo:.05,waterHi:.12,chromaFollow:.3,chromaFollowDark:.7,engineKeep:.5,keepDarkLo:.25,keepDarkHi:.4,darkLo:.2,darkHi:.45,hueMax:20*Math.PI/180},H={darkLo:.1,darkHi:.28,popGate:4,sep:.13,boostSep:.04,sepRange:.12,sepClose:1.3,head:.4,vib:.45,boostVib:.15,vibLo:.06,vibHi:.12,rimLo:.07,rimHi:.15,thick:9,hue:65*Math.PI/180,hiLo:.7,hiHi:.9,detail:.8,rMin:1,rMax:1.45,boostDetail:.7,edge:3,farKeep:.35,veilLo:.065,veilHi:.125,pack:32,levels:16},U={k:.3,range:.2,toeLo:0,toeHi:.12,detail:.4,rMin:.85,rMax:1.25,chroma:1,engine:1,engineLo:.12,engineHi:.3,wMax:1.5,farKeep:.3,farLit:.45,farLo:.07,farHi:.15,bed:.4,spot:.06,spotLo:1.1,spotHi:1.35,spotLLo:.45,spotLHi:.65},_t={lLo:.72,lHi:.86,cross:.5,srcLo:.004};function vt(e){return 2*Math.min(1,Math.max(0,e.subjectPopStrength??.5))}const W={hue:195*Math.PI/180,bandIn:45*Math.PI/180,bandOut:85*Math.PI/180,rLo:.08,rHi:.3,mix:.92,silver:.022,lLo:.12,lHi:.32,farLo:30*Math.PI/180,farHi:60*Math.PI/180,lift:.05,confLo:.05,confHi:.5,warmHue:50*Math.PI/180,warmLo:.1,warmHi:.5};function yt(e){return Math.min(1,Math.max(0,e.backdrop??0))*(1-Math.min(1,Math.max(0,e.calmTone??0)))}const bt={cLo:.06,cHi:.12,keep:.95},G={gamma:0,dim:.5,liftRelief:.6,liftRef:.1,hazeDehaze:.4,hazeClarity:.4,hazeLevels:.15,waterDim:.25,hazeLo:.05,hazeHi:.3,hazeChroma:2,deepLo:.35,deepHi:.8,objChroma:.045,neutralDesat:.8,neutralLo:.025,neutralHi:.05,neutralLLo:.65,neutralLHi:.8,warmHue:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:70*Math.PI/180,warmLo:.006,warmHi:.015,warmHaze:.06,brightLo:.6,brightHi:.8,keepLo:.09,keepHi:.14,targetHue:252*Math.PI/180,c0:0,c1:.11,darkLo:.08,darkHi:.45,darkHaze:.6,farLo:50*Math.PI/180,farHi:110*Math.PI/180,farKeep:.55,mix:.8},xt={target:242*Math.PI/180,pull:.6,bandLo0:130*Math.PI/180,bandLo1:225*Math.PI/180,bandHi0:255*Math.PI/180,bandHi1:305*Math.PI/180,violetCLo:.08,violetCHi:.14,greenShift:22*Math.PI/180,greenLo0:85*Math.PI/180,greenLo1:125*Math.PI/180,greenTop0:205*Math.PI/180,greenTop1:240*Math.PI/180,cLo:0,cHi:.1,lLo:.15,lHi:.4,chroma:.25,dark:.06,darkGreen:.04,darkLLo:.3,darkLHi:.6,darkCLo:.015,darkCHi:.16,blackK:.1,blackLo:0,blackHi:.25,shadowC0:.006,shadowC1:.1,shadowLLo:.15,shadowLHi:.6,shadowKeep:.5,shadowFadeLo:.35,shadowFadeHi:.55,liftLLo:.9,liftNeutralC:.04,lift:.08,hiDesat:.32,warmC:.006,warmHue:80*Math.PI/180,hiHue:236*Math.PI/180,hiHueLo:.56,hiHueHi:.88,blueKeep:.7,blueSpan:12*Math.PI/180,blueMax0:18*Math.PI/180,blueMax1:32*Math.PI/180},St={target:252*Math.PI/180,mix:.9,warmDir:45*Math.PI/180,sLo:-.05,sHi:.03,vcLo:.07,vcHi:.12,vio0:285*Math.PI/180,vio1:310*Math.PI/180,vio2:345*Math.PI/180,vegIn0:60*Math.PI/180,vegIn1:80*Math.PI/180,vegOut0:150*Math.PI/180,vegOut1:195*Math.PI/180,vegCLo:.02,vegCHi:.04,vegGreen:.8,cK:.24,cMax:.12,hiLo:.55,hiHi:.85,hiDrop:.3,neutralLLo:.35,neutralLHi:.6,neutralCLo:.015,neutralCHi:.05,neutralK:.8,warmHue:62*Math.PI/180,warmIn0:30*Math.PI/180,warmIn1:50*Math.PI/180,warmOut0:82*Math.PI/180,warmOut1:105*Math.PI/180,warmCLo:.025,warmCHi:.055,warmLLo:.2,warmLHi:.4,warmPull:.5,warmGain:.35,warmCMax:.15,shadowK:.1,shadowHi:.4,farLo:44*Math.PI/180,farHi:74*Math.PI/180,farMin0:105*Math.PI/180,farMin1:140*Math.PI/180,farCLo:.02,farCHi:.05,farBoost:.43,hiHue:236*Math.PI/180,hiHueLo:.56,hiHueHi:.88,darkLo:.05,darkHi:.3,keepC:.95},Ct={hue:355*Math.PI/180,bandIn:30*Math.PI/180,bandOut:55*Math.PI/180,lLo:.86,lHi:.96,cLo:.04,cHi:.08,mix:.85},wt={hue:305*Math.PI/180,bandIn:22*Math.PI/180,bandOut:42*Math.PI/180,lLo:.35,lHi:.5,cLo:.05,cHi:.09,mix:.75},Tt={calmLo:.15,calmHi:.6,veilLLo:.27,veilLHi:.38,liftLo:.08,liftHi:.25,veilCLo:.06,veilCHi:.11,rovKeep:.25};function Et(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function Dt(e,t,n){let r=Tt,i=Et(r.veilLLo,r.veilLHi,e),a=Et(r.liftLo,r.liftHi,n)*(1-Et(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}function Ot(e,t){return Math.min(1,Math.max(0,t.vivid??0))*Wt(e)*Math.min(1,Math.max(0,e.vividGate??1))}const kt={sunLo:-.15,sunHi:-.3};function At(e,t,n){let r=Tt,i=Math.max(Et(r.veilLLo,r.veilLHi,e),Et(-kt.sunLo,-kt.sunHi,-n)),a=Et(r.liftLo,r.liftHi,n)*(1-Et(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}const jt={lo:.1,hi:.45},Mt={min:.6,max:2,chroma:1},Nt={k:.95,cLo:.02,cHi:.05};function Pt(e,t){let n=Math.max(0,e);return t!==1&&n>0?n**(1+(t-1)*Et(jt.lo,jt.hi,n)):n}function Ft(e,t,n,r=0,i=0){if(!(n<1&&e>1e-6))return 1;let a=1-Et(St.sLo,St.sHi,r*Math.cos(St.warmDir)+i*Math.sin(St.warmDir));return 1+((t/e)**+Mt.chroma-1)*a}const It={amount:.7,calmLo:.05,calmHi:.3},Lt={gain:.5,top:.15,warmGain:.5,warmTop:.12,warmIn0:10*Math.PI/180,warmIn1:45*Math.PI/180,warmOut0:80*Math.PI/180,warmOut1:115*Math.PI/180,magIn0:285*Math.PI/180,magIn1:320*Math.PI/180,magOut0:330*Math.PI/180,magOut1:360*Math.PI/180,cLo:.01,cHi:.07,lLo:.1,lHi:.3,hiLo:.85,hiHi:.97,coolCut:.6,coolIn0:165*Math.PI/180,coolIn1:215*Math.PI/180},Rt={max:4,wbMin:.25,wbMax:5,waterPow:.6,waterMax:3};function zt(e){let t=e.wbTap;if(!t||!(t[0]>0)||!(t[1]>0)||!Number.isFinite(t[0])||!Number.isFinite(t[1]))return null;let n=e=>Math.min(Rt.max,Math.max(1/Rt.max,e)),r=n(t[0]),i=n(t[1]);return r===1&&i===1?null:[r,i]}function Bt(e,t){let n=zt(t);if(!n)return e;let r=[n[0],1,n[1]],i=e.wb.map((e,t)=>t===1?e:Math.min(Rt.wbMax,Math.max(Rt.wbMin,e*r[t]))),a=e.waterWb.map((e,t)=>t===1?e:Math.min(Rt.waterMax,Math.max(1/Rt.waterMax,e*r[t]**+Rt.waterPow)));return{...e,wb:i,waterWb:a}}const Vt={teal:35*Math.PI/180,blue:14*Math.PI/180};function Ht(e){let t=Math.min(1,Math.max(-1,e.waterHue??0));return Number.isFinite(t)?t*(t<0?Vt.teal:Vt.blue):0}function Ut(e,t){let n=e=>Math.min(1,Math.max(0,e)),r=n(Math.max(e.calm??0,e.calmTone??0));return Math.max(n(t.blue??0),It.amount*n(t.vivid??0))*Wt(e)*(1-Et(It.calmLo,It.calmHi,r))*n(e.blueGate??e.vividGate??1)}function Wt(e){let t=Math.min(1,Math.max(0,Math.max(e.calm??0,e.calmTone??0)));return 1-Et(Tt.calmLo,Tt.calmHi,t)}function Gt(e){return Math.min(1,Math.max(0,e.intensity-1))}function Kt(e){let t=Gt(e);return{strength:Math.min(1,Math.max(0,e.intensity)),saturation:e.saturation+.35*t,clarity:Math.min(1,e.clarity+.5*t),veil:e.veil+.3*t,look:Math.min(1,Math.max(0,e.look)),dehaze:.6*t,hazeLift:0,subjectPop:!!e.subjectPop,subjectPopStrength:e.subjectPopStrength,subjectPopWarmth:e.subjectPopWarmth}}function qt(e){let t=Math.min(1,Math.max(0,(e.haze-G.deepLo)/(G.deepHi-G.deepLo)));return t*t*(3-2*t)}function Jt(e){return Yt(e.haze)}function Yt(e){let t=Math.min(1,Math.max(0,(e-G.hazeLo)/(G.hazeHi-G.hazeLo)));return t*t*(3-2*t)}function Xt(e,t){let n=ot[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=[Math.min(n.redMax,Math.max(1,e.wb[0]*n.red)),1,Math.min(1.6,Math.max(.5,e.wb[2]*n.blue))],i=[Math.min(2,r[0]**.6),1,Math.min(2,Math.max(.5,r[2]**.6))];return{...e,wb:r,waterWb:i,exposure:e.exposure*n.exposure}}function Zt(e,t){let n=ot[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=t.preset===`reef`?Math.min(e.dehaze,.15):Math.min(1,Math.max(e.dehaze,n.dehaze));return{...e,dehaze:r,clarity:Math.min(1,Math.max(0,e.clarity+n.clarity)),hazeLift:Math.max(e.hazeLift,n.hazeLift)}}function Qt(e,t){let n=Math.min(1,Math.max(0,t.look));if(n<=0)return e;let r=Jt(e)*n,i=t.hazeAuto===!1?0:$t.lift*Jt(e)*e.hazeBlack,a=G.liftRelief*Math.min(1,i/G.liftRef);return{...e,exposure:e.exposure*(1-G.dim*r*(1-a)),levelsMix:Math.min(.85,e.levelsMix+G.hazeLevels*r)}}const $t={dehaze:.4,clarity:0,levels:.15,lift:.8};function en(e,t){let n=Jt(t);return n<=0?e:{...e,dehaze:Math.max(e.dehaze,$t.dehaze*n),clarity:Math.min(1,e.clarity+$t.clarity*n),hazeLift:Math.max(e.hazeLift,$t.lift*n)}}function tn(e){let t=Jt(e);return t<=0?e:{...e,levelsMix:Math.min(.85,e.levelsMix+$t.levels*t)}}function nn(e,t){let n=e.look;if(n<=0)return e;let r=Jt(t)*n;return{...e,dehaze:Math.max(e.dehaze,G.hazeDehaze*r),clarity:Math.min(1,e.clarity+G.hazeClarity*r)}}function rn(e,t){if(t<=0)return e;let n=1+.8*t,r=e.wb.map(e=>Math.min(5,Math.max(.25,e**+n))),i=1.6+1.4*t,a=.6+.3*t,o=r.map(e=>Math.min(i,Math.max(1/i,e**+a)));return{...e,wb:r,waterWb:o,attn:e.attn.map(e=>e*n),gainCap:e.gainCap+t,levelsMix:Math.min(.85,e.levelsMix+.3*t),chromaK:e.chromaK+t}}const K={hue:45*Math.PI/180,bandHue:65*Math.PI/180,bandIn:50*Math.PI/180,bandOut:75*Math.PI/180,achroma:.012,lLo:.4,lHi:.55,cLo:.07,cHi:.1,mix:1,wLo:.1,wHi:.5,cMin:.05};function an(e){return new Float32Array(e.fields)}function on(e,t){for(let n=0;n<t.length;n++)e[n*4+1]=t[n];return e}function sn(e){let t=new Float32Array(e.width*e.height*4);for(let n=0;n<e.width*e.height;n++)t[n*4]=e.guide[n*3],t[n*4+1]=e.guide[n*3+1],t[n*4+2]=e.guide[n*3+2],t[n*4+3]=e.person?e.person[n]:0;return t}function cn(e){let t=e.tilesX*e.tilesY*e.bins,n=new Float32Array(t*4);for(let r=0;r<t;r++)n[r*4]=e.data[r];return n}const ln=1.1,un=.12,dn=.3,fn=2.2,pn=.1,mn=.4,hn=10*Math.PI/180,q=26*Math.PI/180,gn=.025,_n=60*Math.PI/180,vn=110*Math.PI/180,yn=30*Math.PI/180,bn=60*Math.PI/180,xn=.8,Sn=1.6,Cn=3.5,wn=.55,Tn=1.5,En={strength:1,bMin:.8,objLo:0,objHi:0,bGreenLo:.95,bGreenHi:1.1},Dn={hueLo:275,hueHi:335,lLo:.45,cLo:.015,cHi:.09,maxFraction:.12,step:.88},On=.14,kn=.86,An=.5,jn={target:.4,strength:.3,max:1.5,keepLo:.97,keepHi:.97,keepL0:.45,keepL1:.7,min:.6,dehaze:.3,ceil:1.02},Mn={clip:2,sigLo:.03,sigHi:.1,anchor:1},Nn=.75,Pn=.05,Fn={covLo:.3,covHi:.7,clearLo:.7,clearHi:.85,sig:.8,lift:.7},In=.55,Ln=.5,Rn={low:.75,mid:.5},zn={cLo:.12,cHi:.16,lLo:.5,lHi:.65},Bn=new Map;function J(e,t){let n=Bn.get(e);return(!n||n.length!==t)&&(n=new Float32Array(t),Bn.set(e,n)),n}const Vn=4096,Hn=new Float32Array(Vn+1);for(let e=0;e<=Vn;e++)Hn[e]=te(e/Vn);function Un(e){if(e<=0)return 0;if(e>=1)return 1;let t=e*Vn,n=t|0,r=t-n;return Hn[n]+(Hn[n+1]-Hn[n])*r}function Wn(e,t,r,i={}){let a=t*r,o=J(`lin`,a*3),s=J(`d`,a),l=0,u=0,d=0;for(let t=0;t<a;t++){let n=e[t*4],r=e[t*4+1],i=e[t*4+2];o[t*3]=ne[n],o[t*3+1]=ne[r],o[t*3+2]=ne[i];let a=n/255,c=r/255,f=i/255;s[t]=at.mu0+at.mu1*Math.max(c,f)+at.mu2*a,l+=a,u+=c,d+=f}let f=[l/a,u/a,d/a],p=lr(lr(s,t,r,2,J(`blurA`,a),J(`blurT`,a)),t,r,2,J(`blurB`,a),J(`blurT`,a)),[h,g]=sr(p,[.02,.98]),v=Math.max(.02,g-h),y=J(`z`,a);for(let e=0;e<a;e++)y[e]=Zn((p[e]-h)/v);let b=[],S=[[],[],[]],C=J(`lum`,a),ee=new Uint8Array(a),te=new Uint32Array(10),re=new Uint32Array(1280);for(let e=0;e<a;e++){C[e]=Xn(o,e);let t=Math.min(9,y[e]*10|0);ee[e]=t,te[t]++,re[t*128+Math.min(127,Math.sqrt(C[e])*128|0)]++}let w=new Float32Array(10);for(let e=0;e<10;e++){if(te[e]<24){w[e]=-1;continue}let t=Math.max(6,Math.round(te[e]*.015)),n=0,r=0;for(;r<128&&(n+=re[e*128+r],!(n>=t));r++);let i=(r+1)/128;w[e]=i*i}for(let e=0;e<a;e++){let t=w[ee[e]];t<0||C[e]>t||(b.push(y[e]),S[0].push(o[e*3]),S[1].push(o[e*3+1]),S[2].push(o[e*3+2]))}let E=[0,0,0];{let[e]=sr(y,[.98]),t=0;for(let n=0;n<a;n++)y[n]<e||(E[0]+=o[n*3],E[1]+=o[n*3+1],E[2]+=o[n*3+2],t++);t>0?(E[0]/=t,E[1]/=t,E[2]/=t):(E[0]=f[0],E[1]=f[1],E[2]=f[2])}let[,ie,D]=T(E[0],E[1],E[2]),ae=Math.hypot(ie,D)||1,oe=[ie/ae,D/ae],se=[0,0,0],ce=[0,0,0],O=[0,0,0];{let e=or(b,S);for(let t=0;t<3;t++)se[t]=e[t].A,ce[t]=e[t].beta,O[t]=e[t].c}let le=[se[0],se[1],se[2]],ue=0;for(let e=0;e<a;e++)ue+=y[e];let k=ue/a,de=J(`hueObj`,a),fe=J(`hueFar`,a),pe=J(`chroma`,a),me=J(`veilCos`,a),he=J(`okL`,a),A=J(`okA`,a),ve=J(`okB`,a),ye=J(`bdWater`,a);for(let e=0;e<a;e++){let[t,n,r]=T(o[e*3],o[e*3+1],o[e*3+2]);he[e]=t,A[e]=n,ve[e]=r,ye[e]=1-er(n,r,oe,yn,bn,gn);let i=Math.hypot(n,r);pe[e]=i,me[e]=i>1e-6?(n*oe[0]+r*oe[1])/i:1,de[e]=$n(n,r,oe,hn,q,gn),fe[e]=er(n,r,oe,_n,vn,gn)}let j=J(`bf`,a*3);for(let e=0;e<a;e++){let t=y[e];j[e*3]=se[0]*(1-Math.exp(-(ce[0]*t+O[0]))),j[e*3+1]=se[1]*(1-Math.exp(-(ce[1]*t+O[1]))),j[e*3+2]=se[2]*(1-Math.exp(-(ce[2]*t+O[2])))}let be=J(`backdrop`,a),N=new Float32Array(18),Ce=J(`bdDev`,a),we=Y(c.blueLo,c.blueHi,E[2]/Math.max(1e-4,E[1])),Te=we>0?m(he,A,ve,ye,t,r,be,N,Ce)*we:0;if(we<=0)be.fill(0,0,a);else if(we<1)for(let e=0;e<a;e++)be[e]*=we;let Ee=J(`objHue`,a);for(let e=0;e<a;e++)Ee[e]=Math.max(de[e]*(1-Te*(1-Ce[e])),be[e]);let De=Qn(o,Ee,j,t,r,J(`veilScale`,a)),Oe=xe(se,E)*M.greenObj,ke=M.litSub*Se(se,E),Ae=.2+ke,je=.55+ke,Me=J(`J`,a*3),Ne=J(`conf`,a),Pe=J(`wbWeight`,a),Fe=J(`sigArr`,a),Ie=J(`veilFrac`,a),Le=()=>{for(let e=0;e<a;e++){let t=Math.max(1e-5,C[e]),n=Math.min(1,De[e]),r=0,i=0,a=[0,0,0];for(let t=0;t<3;t++){let o=j[e*3+t];a[t]=n*o;let s=t===0?.2126:t===1?.7152:.0722;r+=De[e]*o*s,i+=a[t]*s}let s=Math.max(0,(t-r)/t);Fe[e]=s,Ie[e]=Math.min(.9,i/t);let c=Y(Ae,je,s)*(1-fe[e]),l=Math.max(Pn,1-i/t);for(let t=0;t<3;t++){let n=o[e*3+t],r=Math.max(n-a[t],n*Pn);Me[e*3+t]=n*l+(r-n*l)*c}let u=Y(pn,mn,s),d=Y(ct.lo,ct.hi,s)*(1-Te+be[e]);Ne[e]=Math.min(u,Math.max(Ee[e],d,Oe)),Pe[e]=Math.sqrt(u)}};Le();let Re=0;{let e=0;for(let t=0;t<a;t++)e+=Ne[t];let[n,i]=sr(Fe,[.5,.95]),s=Y(Fn.covLo,Fn.covHi,e/a)*(1-Y(Fn.clearLo,Fn.clearHi,i));Re=s;let c=1+(Math.min(1,(1-Fn.sig)/Math.max(.001,1-n))-1)*s;if(c<.98){for(let e=0;e<3;e++)se[e]*=c;for(let e=0;e<a*3;e++)j[e]*=c;De=Qn(o,Ee,j,t,r,De),Le()}}let ze=0,Be=0,Ve=0,He=0;for(let e=0;e<a;e++){let t=Pe[e];if(t<=0)continue;let n=Me[e*3],r=Me[e*3+1],i=Me[e*3+2],a=n*n,o=r*r,s=i*i;ze+=t*a*a*a,Be+=t*o*o*o,Ve+=t*s*s*s,He+=t}let P=[1,1,1],Ue=xe(se,E);if(He>0){let e=(ze/He)**(1/6)+1e-5,t=(Be/He)**(1/6)+1e-5,n=(Ve/He)**(1/6)+1e-5;P[0]=Math.min(Cn+(M.greenRMax-Cn)*Ue,Math.max(1,t/e));let r=Math.min(Tn+(M.greenBMax-Tn)*Ue,Math.max(1,se[1]/Math.max(1e-4,se[2])));P[2]=Math.min(r,Math.max(wn,t/n))}let F=Y(.01,.06,He/a);P[0]=1+(P[0]-1)*F,P[2]=1+(P[2]-1)*F;let We=(e,t)=>{let n=Math.min(1.15,Math.max(0,y[e]+Math.min(.25,Math.max(-.25,Ln*(s[e]-p[e])/v)))),r=Math.max(1e-5,C[e]),i=0,a=0,c=[0,0,0];for(let t=0;t<3;t++){let r=st.veil*se[t]*(1-Math.exp(-(ce[t]*n+O[t]))),o=t===0?.2126:t===1?.7152:.0722;c[t]=Math.min(1,De[e])*r,i+=De[e]*r*o,a+=c[t]*o}let l=Y(Ae,je,Math.max(0,(r-i)/r))*(1-fe[e]),u=Math.max(Pn,1-a/r);for(let n=0;n<3;n++){let r=o[e*3+n],i=Math.max(r-c[n],r*Pn);t[n]=r*u+(i-r*u)*l}return n};Ue>0&&(P[0]*=1+(M.greenWarmR-1)*Ue,P[2]*=1+(M.greenWarmB-1)*Ue);let Ge=new Uint8Array(a),Ke=Yn(We,Ne,de,pe,me,C,t,r,Ge);if(Ke.weight>0){let e=se[1]/Math.max(1e-4,se[2]),t=e>1?Math.min(Jn,e*e):1,n=1/Math.max(.5,1+ln*Y(un,dn,g-h)*(Ke.z-k)),r=Math.min(Cn,Math.max(1,(Ke.mean[1]/Math.max(1e-5,Ke.mean[0]))**+n)),i=Math.min(t,Math.max(wn,(qn*Ke.mean[1]/Math.max(1e-5,Ke.mean[2]))**+n)),a=(e,t)=>Math.exp(Math.log(e)+(Math.log(t)-Math.log(e))*Ke.weight);P[0]=a(P[0],r),P[2]=a(P[2],i)}for(let e=0;e<6&&!(rr(Me,Pe,a,P)<=.015);e++)P[0]=Math.max(1,P[0]*.9);for(let e=0;e<6&&P[2]>1&&!(nr(Me,Pe,a,P)<=Dn.maxFraction);e++)P[2]=Math.max(1,P[2]*Dn.step);{let e=0;for(let t=0;t<a;t++)e+=Ne[t];let t=En.strength*(En.objHi>0?Y(En.objLo,En.objHi,e/a):1);P[0]**=+t;let n=f[1]/Math.max(1e-4,f[2]),r=En.bMin+(1-En.bMin)*Y(En.bGreenLo,En.bGreenHi,n)*(1-Ue);P[2]=Math.max(Math.min(1,r),P[2]**+t)}let qe=Y(un,dn,g-h),Je=[ln*qe*Math.log(P[0]),0,ln*qe*Math.log(P[2])];for(let e=0;e<a;e++){let t=y[e]-k;for(let n=0;n<3;n++)Me[e*3+n]*=Math.min(fn,Math.max(1/fn,Math.exp(Je[n]*t)))}let I=e=>Math.min(Sn,Math.max(1/Sn,e**.6)),Ye=[I(P[0]),1,I(P[2])];if(Ye[2]<1&&(Ye[2]+=(1-Ye[2])*Te*Y(1,1.25,se[2]/Math.max(1e-4,se[1]))),Ue>0)for(let e of[0,2])Ye[e]=Math.exp(Math.log(Ye[e])+(Math.log(P[e])-Math.log(Ye[e]))*Ue*M.greenWater);let Xe=J(`waterLin`,a*3);for(let e=0;e<a;e++){Ne[e];for(let t=0;t<3;t++)Me[e*3+t]=Me[e*3+t]*P[t],Xe[e*3+t]=o[e*3+t]*Ye[t]}let Ze=J(`Y`,a),Qe=(e,t,n)=>{let r=Ne[e],i=e*3,a=Xe[i]*n,o=Xe[i+1]*n,s=Xe[i+2]*n,c=(a+(Me[i]*t-a)*r)*.2126;return c+=(o+(Me[i+1]*t-o)*r)*.7152,c+=(s+(Me[i+2]*t-s)*r)*.0722,c=Math.max(c,tr(C[e])*C[e]*n),c>Nn?Nn+(1-Nn)*(1-Math.exp(-(c-Nn)/(1-Nn))):c},$e=0,et=0,L=0;for(let e=0;e<a;e++){let t=Qe(e,1,1);$e+=Ne[e]*Math.log(1e-4+t),et+=Ne[e],L+=Ne[e]}let tt=Y(.02,.15,L/a),nt=et>1e-6?Math.exp($e/et):On,R=Math.min(1.35,Math.max(.75,On/Math.max(1e-4,nt)));R=1+(R-1)*tt;{let e=R**+xn;for(let t=0;t<a;t++)Ze[t]=Qe(t,R,e)}let[rt]=sr(Ze,[.995]);if(rt>kn){R=Math.max(.6,kn/rt*R);let e=R**+xn;for(let t=0;t<a;t++)Ze[t]=Qe(t,R,e)}if(R>1&&jn.ceil>0){let[e]=sr(Ze,[.5]),[t]=sr(C,[.5]),n=jn.ceil**3*t;if(e>n&&e>1e-5){R=Math.max(1,R*n/e);let t=R**+xn;for(let e=0;e<a;e++)Ze[e]=Qe(e,R,t)}}let[it,ot,lt]=sr(Ze,[.004,.1,.5]),dt=(()=>{let e=T(E[0],E[1],E[2]);return Y(zn.cLo,zn.cHi,Math.hypot(e[1],e[2]))*(1-Y(zn.lLo,zn.lHi,e[0]))})(),ft=Zn(it/.12)*(1-dt),mt=Math.min(it,Rn.low*ot,Rn.mid*lt)*(1-Fn.lift*Re),ht=[0,0,0];{let e=R**+xn,t=J(`hazeCh`,a);for(let n=0;n<3;n++){for(let r=0;r<a;r++){let i=Xe[r*3+n]*e;t[r]=i+(Me[r*3+n]*R-i)*Ne[r]}ht[n]=sr(t,[.004])[0]}}if(mt<it)for(let e=0;e<3;e++)ht[e]*=mt/it;{let e=$t.lift*Yt(ft)*mt;if(e>0)for(let t=0;t<a;t++)Ze[t]*=pt(Ze[t],e)}let[gt,B]=sr(Ze,[.004,.996]),V=Math.min(gt,.015),H=Math.min(1,Math.max(B,V+.2,.65));if(jn.ceil>0){let[e]=sr(Ze,[.5]),t=jn.ceil**3*sr(C,[.5])[0],n=e=>e+((e-V)/(H-V)-e)*An;if(e>V&&n(e)>t&&t>e){let n=e+(t-e)/An;n>1e-6&&(H=Math.min(1,Math.max(H,V+(e-V)/n)))}else e>V&&n(e)>t&&(H=Math.max(H,Math.min(1,V+(e-V)/Math.max(1e-6,e))))}let U=J(`enc`,a);for(let e=0;e<a;e++){let t=Ze[e];U[e]=Un(Zn(t+((t-V)/(H-V)-t)*An))}let _t=mr(U,t,r),vt=1;if(jn.strength>0){let e=Math.cbrt(Math.max(1e-4,ne[Math.round(255*Zn(sr(U,[.5])[0]))]));e>jn.target&&e<.98&&(vt=1+(Math.min(jn.max,Math.log(jn.target)/Math.log(e))-1)*jn.strength)}{let e=Math.cbrt(Math.max(1e-4,ne[Math.round(255*Zn(sr(U,[.5])[0]))])),t=Math.cbrt(Math.max(1e-4,sr(C,[.5])[0])),n=jn.dehaze*$t.dehaze*Yt(ft),r=1;if(n>0){let t=J(`toneYd`,a);for(let e=0;e<a;e++)t[e]=Ze[e]*(1-n*Ie[e]*Y(ut.lo,ut.hi,C[e])*(1-Ne[e]));let[i]=sr(Ze,[.5]),[o]=sr(t,[.5]);i>1e-5&&(r=Math.cbrt(Zn(o/i))),e*=r}let i=t*(jn.keepLo+(jn.keepHi-jn.keepLo)*Y(jn.keepL0,jn.keepL1,t));jn.keepLo>0&&e>.02&&e<.98&&e**+vt<i&&(vt=Math.max(jn.min,Math.log(i)/Math.log(e)));let o=t*jn.ceil;if(jn.ceil>0&&e>.02&&e<.98&&o<.98&&e**+vt>o&&(vt=Math.min(jn.max,Math.log(o)/Math.log(e))),jn.ceil>0){let e=r*Math.cbrt(Math.max(1e-4,ne[Math.round(255*Zn(sr(U,[.75])[0]))])),t=Math.cbrt(Math.max(1e-4,sr(C,[.75])[0]))*jn.ceil;e>.02&&e<.98&&t<.98&&e**+vt>t&&(vt=Math.min(jn.max,Math.log(t)/Math.log(e)))}}let yt=Ne,bt=0,G,xt,St;if(Te>0){let e=J(`subjMap`,a),s=J(`notAnimal`,a);s.fill(0,0,a);let c=J(`subjSmall`,a);bt=x(be,Ce,Te,t,r,e,he,N,ye,i.seeds,A,ve,s,xt=[],c),yt=J(`confMap`,a);for(let t=0;t<a;t++)yt[t]=Ne[t]+(e[t]-Ne[t])*Te;let l=e;for(let t=0;t<a;t++)if(c[t]>e[t]){l=J(`subjAll`,a);break}if(l!==e){St=J(`confPop`,a);let n=e=>1-Y(W.rLo,W.rHi,o[e*3]/Math.max(1e-4,o[e*3+1],o[e*3+2]))*(N?Y(0,.04,he[e]-_((e%t+.5)/t,(Math.floor(e/t)+.5)/r,N)):1);for(let i=0;i<a;i++){let a=1;if(c[i]>e[i]){let e=i%t,o=(i-e)/t;for(let i=-1;i<=1;i++)for(let s=-1;s<=1;s++){let c=e+s,l=o+i;c>=0&&l>=0&&c<t&&l<r&&(a=Math.min(a,n(l*t+c)))}a=Y(.5,1,a)}l[i]=Math.max(e[i],c[i]*a*fr),St[i]=Ne[i]+(l[i]-Ne[i])*Te}}G=n(l,Ce,t,r,160,90,s)}let Ct=dr(y,yt,p,De,o,t,r);St&&(Ct.popConf=pr(St,t,r)),G&&(Ct.animals=G),xt&&(Ct.blobs=xt);let wt=ft,Tt=ge(o,a),{calm:Et,calmTone:Ot}=_e(Tt,wt),kt=0,jt=0,Mt=0,Nt=0;for(let e=0;e<r;e++){let n=e<r/3?1:e>=2*r/3?2:0;if(n)for(let r=0;r<t;r++){let i=he[e*t+r];i<.02||(n===1?(kt+=i,jt++):(Mt+=i,Nt++))}}let Pt=T(le[0],le[1],le[2]),Ft=jt>0&&Nt>0?Mt/Nt-kt/jt:0,It=Dt(Pt[0],Math.hypot(Pt[1],Pt[2]),Ft),Lt=At(Pt[0],Math.hypot(Pt[1],Pt[2]),Ft),Rt=0,zt=1,Bt=0;{let e=Float32Array.from(he).sort();Rt=e[Math.floor(.25*(a-1))],zt=e[Math.floor(.97*(a-1))];let t=e[Math.floor(.8*(a-1))],n=0,r=0;for(let e=0;e<a;e++)he[e]>=t&&(n+=o[e*3],r+=o[e*3+1]);Bt=1-Y(z.redLo,z.redHi,n/Math.max(1e-5,r));let i=jt>0&&Nt>0?Mt/Nt-kt/jt:0;Bt*=Y(z.bandLo,z.bandHi,i)}let Vt=cr(he,t,r,Rt,zt);return{params:{toneGamma:vt,seabedNeed:Bt,seabedLw:Rt,seabedLb:zt,seabedGrid:Vt,binf:se,betaB:ce,cB:O,attn:Je,gainCap:fn,zMean:k,wb:P,waterWb:Ye,confLo:pn,confHi:mn,veilColor:E,cosLo:hn,cosHi:q,hueFarLo:_n,hueFarHi:vn,haze:wt,hazeBlack:mt,frameBlack:mt,hazeFloor:ht,achroma:gn,waterExposure:xn,exposure:R,black:V,white:H,levelsMix:An,chromaK:2.6,chromaC0:.025,zLo:h,zHi:g,depthGuide:Ln,floorFrac:Pn,shadowFloor:In,knee:Nn,subLo:Ae,subHi:je,calm:Et,calmTone:Ot,backdrop:Te,backdropFit:Array.from(N),subjectTone:bt,vividGate:It,blueGate:Lt},depth:Ct,clahe:_t,mean:f,diag:{sandWeight:Ke.weight,sandFrac:Ke.frac,sandMask:Ge,calm:Tt,backdrop:Te,tone:{black:it,yLow:ot,yMid:lt,veilCap:Re}}}}const Gn=75*Math.PI/180,Kn=Math.cos(Gn),qn=.94,Jn=1.8;function Yn(e,t,n,r,i,a,o,s,c){let l=o*s,u=J(`sandSq`,l);for(let e=0;e<l;e++)u[e]=a[e]*a[e];let d=lr(a,o,s,2,J(`sandM`,l),J(`blurT`,l)),f=lr(u,o,s,2,J(`sandS`,l),J(`blurT`,l)),p=J(`sandCand`,l),m=0;for(let e=0;e<l;e++){if(p[e]=-1,t[e]<.5||n[e]<.3||a[e]<.12)continue;let o=Math.sqrt(Math.max(0,f[e]-d[e]*d[e]));if(o>.22*d[e]||o<.045*d[e])continue;let s=r[e];s>.13||s>.03&&i[e]<Kn||(p[e]=a[e],m++)}let h=m/l,g=.95*Y(.05,.15,h),_=[0,0,0];if(g<=0)return{weight:0,frac:h,mean:_,z:0};let[v]=sr(p,[1-.30000000000000004*h]),y=0,b=[0,0,0],x=0;for(let t=0;t<l;t++)p[t]<v||(x+=e(t,b),_[0]+=b[0],_[1]+=b[1],_[2]+=b[2],y++);if(y===0)return{weight:0,frac:h,mean:_,z:0};_[0]/=y,_[1]/=y,_[2]/=y;for(let e=0;e<l;e++)c[e]=+(p[e]>=v);return{weight:g,frac:h,mean:_,z:x/y}}function Xn(e,t){return re(e[t*3],e[t*3+1],e[t*3+2])}function Zn(e){return e<0?0:e>1?1:e}function Qn(e,t,n,r,i,a){let o=Array.from({length:144},()=>[]);for(let a=0;a<i;a++){let s=Math.min(8,Math.floor(a*9/i));for(let i=0;i<r;i++){let c=a*r+i;if(t[c]>.5)continue;let l=n[c*3]*.2126;if(l+=n[c*3+1]*.7152,l+=n[c*3+2]*.0722,l<.001)continue;let u=re(e[c*3],e[c*3+1],e[c*3+2]),d=Math.min(15,Math.floor(i*16/r));o[s*16+d].push(u/l)}}let s=new Float32Array(144).fill(NaN);for(let e=0;e<144;e++){let t=o[e];t.length<6||(t.sort((e,t)=>e-t),s[e]=Math.min(2.2,Math.max(.6,t[t.length>>1])))}for(let e=0;e<8;e++){let e=!1,t=new Float32Array(s);for(let n=0;n<9;n++)for(let r=0;r<16;r++){let i=n*16+r;if(!Number.isNaN(s[i]))continue;let a=0,o=0;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++){let i=r+t,c=n+e;if(i<0||c<0||i>=16||c>=9)continue;let l=s[c*16+i];Number.isNaN(l)||(a+=l,o++)}o>0&&(t[i]=a/o,e=!0)}if(s.set(t),!e)break}for(let e=0;e<144;e++)Number.isNaN(s[e])&&(s[e]=1);for(let e=0;e<i;e++){let t=Math.min(Math.max((e+.5)*9/i-.5,0),8),n=Math.floor(t),o=Math.min(n+1,8),c=t-n;for(let t=0;t<r;t++){let i=Math.min(Math.max((t+.5)*16/r-.5,0),15),l=Math.floor(i),u=Math.min(l+1,15),d=i-l,f=s[n*16+l]*(1-d)+s[n*16+u]*d,p=s[o*16+l]*(1-d)+s[o*16+u]*d;a[e*r+t]=f*(1-c)+p*c}}return a}function $n(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 1;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o)),c=Y(r,i,Math.acos(s)),l=Y(a,a*2,o);return c+(1-c)*(1-l)}function er(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 0;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o));return Y(r,i,Math.acos(s))*Y(a,a*2,o)}function Y(e,t,n){let r=Zn((n-e)/(t-e));return r*r*(3-2*r)}function tr(e,t=In){return .97+(t-.97)*Y(.02,.15,e)}function nr(e,t,n,r){let i=Dn,a=0,o=0;for(let s=0;s<n;s+=2){if(t[s]<.5)continue;let[n,c,l]=T(e[s*3]*r[0],e[s*3+1]*r[1],e[s*3+2]*r[2]);if(n<i.lLo)continue;a++;let u=Math.hypot(c,l);if(u<i.cLo||u>i.cHi)continue;let d=ie(c,l);d>i.hueLo&&d<i.hueHi&&o++}return a<20?0:o/a}function rr(e,t,n,r){let i=0,a=0;for(let o=0;o<n;o+=2){if(t[o]<.5)continue;let[n,s,c]=T(e[o*3]*r[0],e[o*3+1]*r[1],e[o*3+2]*r[2]);if(n<.25||n>.9||Math.hypot(s,c)<.06)continue;i++;let l=ie(s,c);l>300&&l<348&&a++}return i<20?0:a/i}const ir=[.3,.45,.65,.9,1.3,1.8,2.5,3.5,5,7],ar=[0,.1,.2,.35,.5,.7,1,1.5];function or(e,t){let n=[{A:0,beta:1,c:0},{A:0,beta:1,c:0},{A:0,beta:1,c:0}];if(e.length<12)return n;let r=Math.max(1,Math.ceil(e.length/400)),i=[],a=[[],[],[]];for(let n=0;n<e.length;n+=r){i.push(e[n]);for(let e=0;e<3;e++)a[e].push(t[e][n])}let o=i.length,s=new Float32Array(o),c=[{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0}];for(let e of ir)for(let t of ar){let n=0;for(let r=0;r<o;r++){let a=1-Math.exp(-(e*i[r]+t));s[r]=a,n+=a*a}let r=1+.05*t;for(let i=0;i<3;i++){let l=a[i],u=0,d=0;for(let e=0;e<o;e++)u+=s[e]*l[e],d+=l[e]*l[e];let f=n>1e-9?Math.min(1,Math.max(0,u/n)):0,p=(f*f*n-2*f*u+d)*r;p<c[i].err&&(c[i]={A:f,beta:e,c:t,err:p})}}let l=(e,t)=>e.A*(1-Math.exp(-(e.beta*t+e.c))),u=1;for(let e of[.1,.3,.6,1]){let t=l(c[0],e),n=.85*Math.min(l(c[1],e),l(c[2],e));t>n&&(u=Math.min(u,t>1e-6?n/t:0))}return c[0].A*=Math.max(0,u),c.map(e=>({A:e.A,beta:e.beta,c:e.c}))}function sr(e,t){let n=1/0,r=-1/0;for(let t=0;t<e.length;t++){let i=e[t];i<n&&(n=i),i>r&&(r=i)}if(!(r>n))return t.map(()=>n);let i=2048,a=new Uint32Array(i),o=(i-1)/(r-n);for(let t=0;t<e.length;t++)a[(e[t]-n)*o|0]++;let s=[];for(let r of t){let t=r*e.length,c=0,l=0;for(;l<i&&(c+=a[l],!(c>=t));l++);s.push(n+Math.min(l,i-1)/o)}return s}function cr(e,t,n,r,i){let a=z.grid,o=Array(a*a).fill(0),s=Array(a*a).fill(0),c=Array(a*a).fill(0),l=Math.max(i,r+.05),u=r+z.lo*(l-r),d=r+(z.lo+z.span)*(l-r);for(let r=0;r<n;r++){let i=Math.min(a-1,Math.floor(r*a/n));for(let l=0;l<t;l++){let f=i*a+Math.min(a-1,Math.floor(l*a/t)),p=r*t+l;o[f]+=Y(u,d,e[p]),c[f]+=(l+1<t?Math.abs(e[p+1]-e[p]):0)+(r+1<n?Math.abs(e[p+t]-e[p]):0),s[f]++}}return o.map((e,t)=>s[t]>0?e/s[t]*Math.max(Y(z.y0,z.y1,(Math.floor(t/a)+.5)/a),Y(z.texLo,z.texHi,c[t]/s[t])):0)}function lr(e,t,n,r,i=new Float32Array(t*n),a=new Float32Array(t*n)){let o=2*r+1;for(let i=0;i<n;i++){let n=0;for(let a=-r;a<=r;a++)n+=e[i*t+ur(a,t)];for(let s=0;s<t;s++)a[i*t+s]=n/o,n+=e[i*t+ur(s+r+1,t)]-e[i*t+ur(s-r,t)]}for(let e=0;e<t;e++){let s=0;for(let i=-r;i<=r;i++)s+=a[ur(i,n)*t+e];for(let c=0;c<n;c++)i[c*t+e]=s/o,s+=a[ur(c+r+1,n)*t+e]-a[ur(c-r,n)*t+e]}return i}function ur(e,t){return e<0?0:e>=t?t-1:e}function dr(e,t,n,r,i,a,o){let s=lr(e,a,o,1),c=lr(lr(t,a,o,1),a,o,1),l=new Float32Array(14400*4),u=new Float32Array(14400*3);for(let e=0;e<90;e++){let t=Math.floor(e*o/90),d=Math.max(t+1,Math.floor((e+1)*o/90));for(let o=0;o<160;o++){let f=Math.floor(o*a/160),p=Math.max(f+1,Math.floor((o+1)*a/160)),m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;for(let e=t;e<d;e++)for(let t=f;t<p;t++){let o=e*a+t;m+=s[o],h+=c[o],g+=n[o],_+=r[o],v+=i[o*3],y+=i[o*3+1],b+=i[o*3+2],x++}let S=e*160+o;l[S*4]=m/x,l[S*4+1]=h/x,l[S*4+2]=g/x,l[S*4+3]=_/x,u[S*3]=v/x,u[S*3+1]=y/x,u[S*3+2]=b/x}}return{width:160,height:90,fields:l,guide:u}}const fr=.85;function pr(e,t,n){let r=lr(lr(e,t,n,1),t,n,1),i=new Float32Array(14400);for(let e=0;e<90;e++){let a=Math.floor(e*n/90),o=Math.max(a+1,Math.floor((e+1)*n/90));for(let n=0;n<160;n++){let s=Math.floor(n*t/160),c=Math.max(s+1,Math.floor((n+1)*t/160)),l=0,u=0;for(let e=a;e<o;e++)for(let n=s;n<c;n++)l+=r[e*t+n],u++;i[e*160+n]=l/u}}return i}function mr(e,t,n){let r=new Float32Array(1536),i=new Float32Array(32);for(let a=0;a<6;a++){let o=Math.floor(a*n/6),s=Math.floor((a+1)*n/6);for(let n=0;n<8;n++){let c=Math.floor(n*t/8),l=Math.floor((n+1)*t/8);i.fill(0);let u=0,d=0,f=0;for(let n=o;n<s;n++)for(let r=c;r<l;r++){let a=e[n*t+r];i[Math.min(31,a*32|0)]++,d+=a,f+=a*a,u++}let p=.5;for(let e=0,t=0;e<32;e++){if(t+i[e]>=u/2&&i[e]>0){p=(e+(u/2-t)/i[e])/32;break}t+=i[e]}let m=Mn.clip*u/32,h=0;for(let e=0;e<32;e++)i[e]>m&&(h+=i[e]-m,i[e]=m);let g=h/32,_=(a*8+n)*32;if(u===0){for(let e=0;e<32;e++)r[_+e]=(e+1)/32;continue}let v=d/u,y=Y(Mn.sigLo,Mn.sigHi,Math.sqrt(Math.max(0,f/u-v*v))),b=0,x=p;{let e=Math.min(31,p*32|0),t=0;for(let n=0;n<e;n++)t+=i[n]+g;x=(t+(i[e]+g)*(p*32-e))/u}let S=Mn.anchor*(x-p);for(let e=0;e<32;e++){b+=i[e]+g;let t=(e+1)/32;r[_+e]=Zn(t+y*(b/u-t-S))}}}return{tilesX:8,tilesY:6,bins:32,data:r}}const X={popLo:.2,popHi:.6,alphaR:6,rampIn:2.5,trustLo:2,trustHi:4.5,evLo:.025,evHi:.07,evFar:.4,rampEv:1,thinLevels:4,jbuK:.5,jbuNoise:.02,jbuLo:.46,jbuHi:.72};function hr(e,t,n){let r=Math.min(n,...t),i=Math.max(n,...t),a=1/Math.max(X.jbuNoise,X.jbuK*(i-r));return e.map((e,r)=>e*Math.exp(-(((t[r]-n)*a)**2)))}const gr=`
const float CONF_BRIGHT_LO = ${ct.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${ct.hi.toFixed(4)};
const float PERSON_LUM_LO = ${lt.lo.toFixed(4)};
const float PERSON_LUM_HI = ${lt.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${ut.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${ut.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${dt.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${dt.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${dt.farKeep.toFixed(4)};
const float VIVID_C_LO = ${bt.cLo.toFixed(4)};
const float VIVID_C_HI = ${bt.cHi.toFixed(4)};
const float VIVID_KEEP = ${bt.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${D.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${ae.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${oe.toFixed(4)};
const float LOOK_GAMMA = ${G.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${G.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${G.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${G.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${G.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${G.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${G.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${G.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${G.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${G.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${G.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${G.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${G.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${G.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${G.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${G.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${G.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${G.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${G.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${G.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${G.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${G.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${G.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${G.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${G.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${G.keepHi.toFixed(4)};
const float LOOK_C0 = ${G.c0.toFixed(4)};
const float LOOK_C1 = ${G.c1.toFixed(4)};
const float LOOK_MIX = ${G.mix.toFixed(4)};
const float SKIN_HUE = ${K.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${K.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${K.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${K.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${K.achroma.toFixed(4)};
const float SKIN_L_LO = ${K.lLo.toFixed(4)};
const float SKIN_L_HI = ${K.lHi.toFixed(4)};
const float SKIN_C_LO = ${K.cLo.toFixed(4)};
const float SKIN_C_HI = ${K.cHi.toFixed(4)};
const float SKIN_MIX = ${K.mix.toFixed(4)};
const float SKIN_W_LO = ${K.wLo.toFixed(4)};
const float SKIN_W_HI = ${K.wHi.toFixed(4)};
const float SKIN_C_MIN = ${K.cMin.toFixed(4)};
const float DG_K = ${mt.k.toFixed(4)};
const float DG_EPS = ${mt.eps.toFixed(5)};
const float DG_R_MIN = ${mt.rMin.toFixed(4)};
const float DG_R_MAX = ${mt.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(W.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(W.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(W.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(W.bandIn).toFixed(6)};
const float ON_R_LO = ${W.rLo.toFixed(4)};
const float ON_R_HI = ${W.rHi.toFixed(4)};
const float ON_L_LO = ${W.lLo.toFixed(4)};
const float ON_L_HI = ${W.lHi.toFixed(4)};
const float ON_MIX = ${W.mix.toFixed(4)};
const float ON_FAR_LO = ${W.farLo.toFixed(6)};
const float ON_FAR_HI = ${W.farHi.toFixed(6)};
const float ON_LIFT = ${W.lift.toFixed(4)};
const float ON_SILVER = ${W.silver.toFixed(4)};
const float SC_K = ${gt.k.toFixed(4)};
const float SC_CMAX = ${gt.cMax.toFixed(4)};
const float SC_DESAT = ${gt.desat.toFixed(4)};
const float SC_EDGE = ${gt.edgeFloor.toFixed(4)};
const float SP_VIVID = ${V.vividKeep.toFixed(4)};
const float SP_CLARITY = ${V.clarity.toFixed(4)};
const float SP_LIFT = ${V.lift.toFixed(4)};
const float WP_HUE = ${B.hue.toFixed(4)};
const float SB_HUE = ${z.hue.toFixed(4)};
const float SB_CHROMA = ${z.chroma.toFixed(4)};
const float SB_KEEP = ${z.keep.toFixed(4)};
const float SB_LIFT = ${z.lift.toFixed(4)};
const float SB_GRID = ${z.grid.toFixed(1)};
const float SB_W_LO = ${z.wLo.toFixed(4)};
const float SB_W_HI = ${z.wHi.toFixed(4)};
const float WP_CMIN = ${B.cMin.toFixed(4)};
const float WP_CMAX = ${B.cMax.toFixed(4)};
const float WP_KEEP = ${B.keep.toFixed(4)};
const float WP_LLO = ${B.lLo.toFixed(4)};
const float WP_LHI = ${B.lHi.toFixed(4)};
const float WP_WLO = ${B.wLo.toFixed(4)};
const float WP_WHI = ${B.wHi.toFixed(4)};
const float WP_SIDE = ${B.side.toFixed(4)};
const float WP_CAST_LO = ${B.castLo.toFixed(4)};
const float WP_CAST_HI = ${B.castHi.toFixed(4)};
const float WP_LIT_LO = ${B.litLo.toFixed(4)};
const float WP_LIT_HI = ${B.litHi.toFixed(4)};
const float WP_UP_LO = ${B.upLo.toFixed(4)};
const float WP_UP_HI = ${B.upHi.toFixed(4)};
const float WP_FLOOR = ${B.floor.toFixed(4)};
const float WP_FLOOR_KEEP = ${B.floorKeep.toFixed(4)};
const float WP_ENGINE_TONE = ${B.engineTone.toFixed(4)};
const float WP_AMOUNT = ${B.amount.toFixed(4)};
const float SP_CHROMA = ${V.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${V.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${V.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${V.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${V.chromaFollowDark.toFixed(4)};
const float SP_WATER_LO = ${V.waterLo.toFixed(4)};
const float SP_WATER_HI = ${V.waterHi.toFixed(4)};
const float SP_DARK_LO = ${V.darkLo.toFixed(4)};
const float SP_DARK_HI = ${V.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(V.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(V.hueMax).toFixed(6)};
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
const float ON_CONF_LO = ${W.confLo.toFixed(4)};
const float ON_CONF_HI = ${W.confHi.toFixed(4)};
const float SEG_POP_LO = ${X.popLo.toFixed(4)};
const float SEG_POP_HI = ${X.popHi.toFixed(4)};
const float SEG_ALPHA_R = ${X.alphaR.toFixed(4)};
const float SEG_RAMP_IN = ${X.rampIn.toFixed(4)};
const float SEG_TRUST_LO = ${X.trustLo.toFixed(4)};
const float SEG_TRUST_HI = ${X.trustHi.toFixed(4)};
const float SEG_EV_LO = ${X.evLo.toFixed(4)};
const float SEG_EV_HI = ${X.evHi.toFixed(4)};
const float SEG_EV_FAR = ${X.evFar.toFixed(4)};
const float SEG_RAMP_EV = ${X.rampEv.toFixed(4)};
const float SEG_THIN_LEVELS = ${X.thinLevels.toFixed(4)};
const float SEG_JBU_K = ${X.jbuK.toFixed(4)};
const float SEG_JBU_NOISE = ${X.jbuNoise.toFixed(4)};
const float SEG_JBU_LO = ${X.jbuLo.toFixed(4)};
const float SEG_JBU_HI = ${X.jbuHi.toFixed(4)};
const float SR_DARK_LO = ${H.darkLo.toFixed(4)};
const float SR_DARK_HI = ${H.darkHi.toFixed(4)};
const float SR_POP_GATE = ${H.popGate.toFixed(4)};
const float SR_SEP = ${H.sep.toFixed(4)};
const float SR_X_SEP = ${H.boostSep.toFixed(4)};
const float SR_SEP_RANGE = ${H.sepRange.toFixed(4)};
const float SR_SEP_CLOSE = ${H.sepClose.toFixed(4)};
const float WG_L_LO = ${_t.lLo.toFixed(4)};
const float WG_L_HI = ${_t.lHi.toFixed(4)};
const float WG_CROSS = ${_t.cross.toFixed(4)};
const float WG_SRC_LO = ${_t.srcLo.toFixed(4)};
const float SR_HEAD = ${H.head.toFixed(4)};
const float SR_VIB = ${H.vib.toFixed(4)};
const float SR_X_VIB = ${H.boostVib.toFixed(4)};
const float SR_VIB_LO = ${H.vibLo.toFixed(4)};
const float SR_VIB_HI = ${H.vibHi.toFixed(4)};
const float SR_RIM_LO = ${H.rimLo.toFixed(4)};
const float SR_RIM_HI = ${H.rimHi.toFixed(4)};
const float SEG_THICK_R = ${H.thick.toFixed(4)};
const float SR_COS = ${Math.cos(H.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(H.hue).toFixed(6)};
const float SR_FAR_KEEP = ${H.farKeep.toFixed(4)};
const float SR_EDGE = ${H.edge.toFixed(4)};
const float SEG_PACK = ${H.pack.toFixed(4)};
const float SEG_LEVELS = ${H.levels.toFixed(4)};
const float SR_HI_LO = ${H.hiLo.toFixed(4)};
const float SR_HI_HI = ${H.hiHi.toFixed(4)};
const float SR_DETAIL = ${H.detail.toFixed(4)};
const float SR_R_MIN = ${H.rMin.toFixed(4)};
const float SR_R_MAX = ${H.rMax.toFixed(4)};
const float SR_X_DETAIL = ${H.boostDetail.toFixed(4)};
const float SD_K = ${U.k.toFixed(4)};
const float SD_RANGE = ${U.range.toFixed(4)};
const float SP_HI_LO = ${V.hiLo.toFixed(4)};
const float SP_HI_HI = ${V.hiHi.toFixed(4)};
const float SD_DETAIL = ${U.detail.toFixed(4)};
const float SD_R_MIN = ${U.rMin.toFixed(4)};
const float SD_R_MAX = ${U.rMax.toFixed(4)};
const float SD_CHROMA = ${U.chroma.toFixed(4)};
const float SD_ENGINE = ${U.engine.toFixed(4)};
const float SD_ENGINE_LO = ${U.engineLo.toFixed(4)};
const float SD_ENGINE_HI = ${U.engineHi.toFixed(4)};
const float SD_TOE_LO = ${U.toeLo.toFixed(4)};
const float SD_TOE_HI = ${U.toeHi.toFixed(4)};
const float SD_W_MAX = ${U.wMax.toFixed(4)};
const float SD_FAR_KEEP = ${U.farKeep.toFixed(4)};
const float SD_FAR_LIT = ${U.farLit.toFixed(4)};
const float SD_SPOT = ${U.spot.toFixed(4)};
const float SD_SPOT_LO = ${U.spotLo.toFixed(4)};
const float SD_SPOT_HI = ${U.spotHi.toFixed(4)};
const float SD_SPOT_L_LO = ${U.spotLLo.toFixed(4)};
const float SD_SPOT_L_HI = ${U.spotLHi.toFixed(4)};
const float SD_BED = ${U.bed.toFixed(4)};
const float SD_FAR_LO = ${U.farLo.toFixed(4)};
const float SD_FAR_HI = ${U.farHi.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(W.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(W.warmHue).toFixed(6)};
const float ON_WARM_LO = ${W.warmLo.toFixed(4)};
const float ON_WARM_HI = ${W.warmHi.toFixed(4)};
${Object.entries(xt).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(St).map(([e,t])=>`const float BW_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(Lt).map(([e,t])=>`const float RL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(Ct).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(wt).map(([e,t])=>`const float PV_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
const float TONE_TOE_LO = ${jt.lo.toFixed(6)};
const float TONE_TOE_HI = ${jt.hi.toFixed(6)};
const float TONE_CHROMA = ${Mt.chroma.toFixed(6)};
const float WK_K = ${Nt.k.toFixed(6)};
const float WK_C_LO = ${Nt.cLo.toFixed(6)};
const float WK_C_HI = ${Nt.cHi.toFixed(6)};
`,_r=gr.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`);`${gr}${rt()}${ze}`,`${_r}${it()}${Be}`;const vr=ht.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),yr=ht.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),br=`
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
${vr}
  return acc / sw;
}`,xr=`
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
${yr}
  return acc.xyz / acc.w;
}`,Sr=e=>e.replaceAll(`dgTap`,`dgTapNr`).replaceAll(`detailBase`,`detailBaseNr`).replaceAll(`u_source`,`u_tpNr`);Sr(br),Sr(xr);const Cr=H.thick;function wr(e){let t=Math.floor((e+8)/H.pack),n=Math.floor((t+.5)/(H.levels+1));return[e-H.pack*t,(t-(H.levels+1)*n)/H.levels,n/X.thinLevels]}const Tr=new WeakMap;function Er(e){if(!e.popConf)return e;let t=Tr.get(e);return t||(t={...e,fields:on(new Float32Array(e.fields),e.popConf)},Tr.set(e,t)),t}function Dr(e){let t=e.settings.subjectPop&&e.depth.popConf?{...e,depth:Er(e.depth)}:e,n=t.settings.hazeAuto!==!1,r=Bt(Qt((n?tn:e=>e)(Xt(rn(ve(t.params),Gt(t.settings)),t.settings)),t.settings),t.settings),i=De(Zt(ye(Kt(t.settings),r),t.settings),r);return{...t,params:r,settings:{...nn(n?en(i,r):i,r),vivid:Ot(r,t.settings),blue:Ut(r,t.settings)},seabed:Or(r,t.settings),waterTint:Ht(t.settings),fitLook:Ye(r,t.settings),fitLookGate:Xe(r,t.settings),fitLookMix:Ze(t.settings)}}function Or(e,t){return Z(t.seabed??0,0,1)*Z(e.seabedNeed??0,0,1)*(1-Z(e.backdrop??0,0,1))}function kr(e,t,n){let r=z.grid,i=e.seabedGrid;if(!i||i.length!==r*r)return 0;let a=t*r-.5,o=n*r-.5,s=Math.floor(a+.5),c=Math.floor(o+.5),l=a-s,u=o-c,d=[.5*(.5-l)*(.5-l),.75-l*l,.5*(.5+l)*(.5+l)],f=[.5*(.5-u)*(.5-u),.75-u*u,.5*(.5+u)*(.5+u)],p=0;for(let e=0;e<3;e++)for(let t=0;t<3;t++)p+=d[t]*f[e]*i[Z(c+e-1,0,r-1)*r+Z(s+t-1,0,r-1)];return Q(z.wLo,z.wHi,p)}const Ar=.12;function jr(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=0,b=0,x=0,S=0,C=0,ee=0,te=0,ne=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of ne){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*Ar*Ar)),p=s*4,ne=e.person?e.person[s]:0;h+=f*e.fields[p],g+=f*e.fields[p+1],_+=f*e.fields[p+2],v+=f*e.fields[p+3],b+=f*ne,y+=f,x+=o*e.fields[p],S+=o*e.fields[p+1],C+=o*e.fields[p+2],ee+=o*e.fields[p+3],te+=o*ne}let re=Math.min(1,y/.08);return y<1e-6?[x,S,C,ee,0,te]:[h/y,g/y,_/y,v/y,re,b/y]}function Mr(e,t,n,r){let i=r*e.bins-1,a=t=>{let n=t*e.bins;if(i<0)return e.data[n]*(i+1);let r=Math.min(e.bins-1,Math.floor(i)),a=Math.min(e.bins-1,r+1),o=Math.min(1,Math.max(0,i-r));return e.data[n+r]+(e.data[n+a]-e.data[n+r])*o},o=Math.min(Math.max(t*e.tilesX-.5,0),e.tilesX-1),s=Math.min(Math.max(n*e.tilesY-.5,0),e.tilesY-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.tilesX-1),d=Math.min(l+1,e.tilesY-1),f=o-c,p=s-l,m=a(l*e.tilesX+c)*(1-f)+a(l*e.tilesX+u)*f,h=a(d*e.tilesX+c)*(1-f)+a(d*e.tilesX+u)*f;return m*(1-p)+h*p}function Nr(e,t,n,r,i,a,o,s=0){let{params:l,settings:u}=e,d=o?o[0]:t,f=o?o[1]:n,p=o?o[2]:r,m=ee(d),h=ee(f),y=ee(p),b=at.mu0+at.mu1*Math.max(f,p)+at.mu2*d,[x,S,C,ne,w,E]=jr(e.depth,i,a,m,h,y),ie=Z(E,0,1),D=Math.max(.02,l.zHi-l.zLo),ae=Z((b-l.zLo)/D,0,1.15),oe=ae+(Z(x+Z(l.depthGuide*(b-C)/D,-.25,.25),0,1.15)-ae)*w,se=1+(ne-1)*w,ce=[m,h,y],O=Math.max(1e-5,re(m,h,y)),le=[0,0,0],ue=[0,0,0],k=0,de=0,fe=Math.min(1,se);for(let e=0;e<3;e++){let t=u.veil*l.binf[e]*(1-Math.exp(-(l.betaB[e]*oe+l.cB[e])));le[e]=se*t,ue[e]=fe*t;let n=e===0?.2126:e===1?.7152:.0722;k+=le[e]*n,de+=ue[e]*n}let pe=Math.max(0,(O-k)/O),me=T(m,h,y),he=me[1],A=me[2],ge=Q(l.subLo,l.subHi,pe)*(1-ci(he,A,l))*(1-M.greenProp*Ee(l)),_e=Math.max(l.floorFrac,1-de/O),ve=[0,1,2].map(e=>Math.min(l.gainCap,Math.max(1/l.gainCap,Math.exp(l.attn[e]*(oe-l.zMean))))),ye=je(ce,ke(e.depth,i,a,m,h,y),ve.map((e,t)=>Math.max(e*l.wb[t],l.waterWb[t])),le),j=ye.c,be=Fe(ye.snrR),N=Me(l.waterWb[0],ve[0]*l.wb[0],ye.snrR),xe=[0,0,0];for(let e=0;e<3;e++){let t=j[e],n=Math.max(t-ue[e],t*l.floorFrac),r=t*_e+(n-t*_e)*ge,i=ve[e]*l.wb[e];xe[e]=r*(e===0?1+(i-1)*be:i)}let Se=Q(l.confLo,l.confHi,pe),Ce=Q(ct.lo,ct.hi,pe),we=yt(l),Te=l.backdropFit,De=we>0&&Te&&Te.length===18?g(me[0],he,A,i,a,Te):1,Ae=Math.min(Se,Math.max(ui(he,A,l)*(1+(De-1)*we),Ce,Ee(l)*M.greenObj)),Le=ie*Q(lt.lo,lt.hi,O),Re=1+(De-1)*we,ze=Math.max(Math.min(Z(S,0,1),Re)*w+Ae*(1-w),Le)*Se*(1-we*$r(m,h,y)),Be=e.settings.subjectPop?Z(l.subjectTone??0,0,1):0,Ve=we>0&&Te&&Te.length===18?v(me[0],he,A,i,a,Te):1,He=we>0&&Te&&Te.length===18?Math.max(pi(e.depth,i,a,Z(S,0,1)*w,Ve),s*Q(c.subjLo,c.subjHi,Ve)):0,[P,Ue]=gi(e.depth,i,a),F=e.seg&&e.settings.subjectPop?zr(e.seg.strength,i,a,e.seg.guide):null,We=e.settings.subjectPop?vt(e.settings):0,[,Ge,Ke]=T(l.veilColor[0],l.veilColor[1],l.veilColor[2]),qe=Math.hypot(Ge,Ke)||1,Je=Math.max(He,we>0?Ue*Q(c.holdLo,c.holdHi,Ve):0)*we*Be*P;if(e.debug)return[w,Ae,Z(S,0,1)];let I=[0,0,0],Ye=l.exposure**+l.waterExposure,Xe=1-u.dehaze*Math.min(.9,de/O)*Q(ut.lo,ut.hi,O);for(let e=0;e<3;e++){let t=j[e]*(e===0?N:l.waterWb[e])*Ye*Xe;I[e]=t+(xe[e]*l.exposure-t)*ze}let Ze=ft(l,u.hazeLift),Qe=1;if(Ze[0]+Ze[1]+Ze[2]>0){let e=re(I[0],I[1],I[2]),t=ci(he,A,l),n=pt(e,u.hazeLift*l.hazeBlack*(1-dt.farKeep));for(let e=0;e<3;e++)I[e]*=pt(I[e],Ze[e])+(n-pt(I[e],Ze[e]))*t;Qe=e>1e-6?re(I[0],I[1],I[2])/e:1}let L=re(I[0],I[1],I[2]),tt=L+((L-l.black)/(l.white-l.black)-L)*l.levelsMix,nt=L>1e-5?Math.max(0,tt)/L:1;for(let e=0;e<3;e++)I[e]*=nt;L=Math.max(0,tt);let R=Math.cbrt(Math.max(0,L)),rt=F?Vr(F,me,Ge/qe,Ke/qe,Be,We):0,it=(F?rt:V.engineKeep*Zr(Je)*(gt.edgeFloor+(1-gt.edgeFloor)*Q(c.subjLo,c.subjHi,Ve)))*Q(V.darkLo,V.darkHi,R),ot=Math.max(yt(l),F?Br(F[3]):0),st=it*ot*We*(F?1:Q(V.waterLo,V.waterHi,Ve)),ht=F?rt*We*Ur(F,me,Ge/qe,Ke/qe):0,_t=1-(1-U.farKeep)*Q(bt.cLo,bt.cHi,Math.hypot(he,A))*ci(he,A,l),G=_t*(1-U.bed*kr(l,i,a)*(1-(F?Z(F[4]??1,0,1):0))),xt=F?Math.max(U.farLit,Q(U.farLo,U.farHi,F[4]??1),Math.min(1,4*Z(F[5]??0,0,1))):1,Ct=ht*Q(H.darkLo,H.darkHi,R)*G*xt,wt=F?Hr(F):we>0&&Te&&Te.length===18?_(i,a,Te):-1,Tt=F?e.seg.popDir??1:1,Et=H.sepRange*(1+(H.sepClose-1)*(F?Z(F[4]??1,0,1):0)),Dt=wt>=0?me[0]>=wt?Q(0,Et,me[0]-wt):-Q(0,U.range,wt-me[0]):Tt,Ot=wt>=0?1-Q(0,U.engineLo,wt-me[0]):1,kt=(F?ht*Math.max(0,-Dt)*Q(0,X.alphaR+(X.rampIn-X.alphaR)*Z(F[5]??0,0,1),(F[2]-.5)*2*X.alphaR):U.engine*Zr(Je)*Q(c.subjLo,c.subjHi,Ve)*Q(V.waterLo,V.waterHi,Ve)*ot*We*(wt>=0?Q(U.engineLo,U.engineHi,wt-me[0]):0))*_t,At=F?st:st*Ot*G;if(u.clarity>0){let t=te(Z(L,0,1)),n=ee(Z(t+(Mr(e.clahe,i,a,t)-t)*(u.clarity+V.clarity*At*(1-Q(V.hiLo,V.hiHi,R))),0,1));nt=L>1e-5?n/L:1;for(let e=0;e<3;e++)I[e]*=nt}{let e=re(I[0],I[1],I[2]),t=tr(O,l.shadowFloor)*O*Ye*Qe,n=Math.max(e,t);if(n=Pe(n,O,Ee(l)*(1-ze)),n>l.knee&&(n=l.knee+(1-l.knee)*(1-Math.exp(-(n-l.knee)/(1-l.knee)))),e>1e-6){if(n!==e){let t=n/e;I[0]*=t,I[1]*=t,I[2]*=t}}else{let e=n/O;I[0]=ce[0]*e,I[1]=ce[1]*e,I[2]=ce[2]*e}}let[,jt,Mt]=T(m,h,y),It=Math.hypot(jt,Mt),Lt=T(Math.max(0,I[0]),Math.max(0,I[1]),Math.max(0,I[2])),Rt=Lt[0],zt=Lr(Rt,Lt[1],Lt[2],jt,Mt,Ge/qe,Ke/qe,Be),Bt=Lt[1]*zt,Vt=Lt[2]*zt,Ht=Math.hypot(Bt,Vt),Ut=l.chromaK*It+l.chromaC0,Wt=Ht>Ut?Ut/Ht:1,Gt=Q(bt.cLo,bt.cHi,It)*ci(jt,Mt,l),Kt=bt.keep*It*Gt;Ht>1e-6&&Ht*Wt<Kt&&(Wt=Kt/Ht),Wt*=u.saturation;let Yt=li(jt,Mt,l,W.farLo,W.farHi);[Bt,Vt]=Oe(Rt,Bt,Vt,Ee(l)*(1-M.gnObjKeep*ze));let Xt=Xr(Rt,Bt,Vt,m,h,y,Yt,F?0:it,ot)*Q(V.keepDarkLo,V.keepDarkHi,Rt),Zt=ie*(1-yt(l)*$r(m,h,y));Wt*=Qr(Bt,Vt,m,h,y,Yt,Zt,F?yt(l):ot);let[Qt,$t]=Yr(Bt*Wt,Vt*Wt,Ge/qe,Ke/qe,Xt/W.mix),en=Q(B.castLo,B.castHi,Math.hypot(Bt,Vt)*Wt),tn=Rt,nn=ei(tn,Qt,$t,Zt),rn=ti(tn,nn[0],nn[1],u.look,1-ui(he,A,l),Jt(l),qt(l)),an=Ie(rn[0],rn[1],rn[2],jt,Mt,ie,Yt),on=Ne(rn[0],an[0],an[1],Ee(l),Yt),sn=ni(rn[0],on[0],on[1],u.vivid??0,Ee(l)),cn=At>0&&!F?ni(rn[0],on[0],on[1],(u.vivid??0)*(1-V.vividKeep*Math.min(1,At)),Ee(l))[0]:sn[0],ln=wt>=0?Q(B.upLo,B.upHi,me[0]-wt):1,un=F?cn:cn+V.lift*At*Tt*4*cn*Math.max(0,1-cn)*(1-Q(V.hiLo,V.hiHi,cn)),dn=1+(V.chromaFollowDark+(V.chromaFollow-V.chromaFollowDark)*Q(V.keepDarkLo,V.keepDarkHi,cn))*(un/Math.max(1e-4,cn)-1);sn[0]=un,sn[1]*=dn,sn[2]*=dn;let fn=oi(sn[0],sn[1],sn[2]),pn=Rr(fn[0],fn[1],jt,Mt,Z(it*ot,0,1)*$r(m,h,y)),mn=Q(B.wLo,B.wHi,it)*(F?0:Q(c.subjLo,c.subjHi,Ve))*(u.subjectPop?Math.min(1,2*Math.max(0,u.subjectPopWarmth??0)):0)*B.amount*en*Ir(sn[0])*ln,hn=Fr(sn[0],pn[0],pn[1],mn,B.engineTone),q=ri(sn[0],hn[0],hn[1],u.blue??0,Ee(l));if([q[1],q[2]]=ii(q[1],q[2],e.waterTint??0,Ee(l)),[q[1],q[2]]=ai(q[0],q[1],q[2],u.vivid??0),(e.seabed??0)>0){let t=kr(l,i,a)*(1-Gt)*e.seabed;q[0]+=z.lift*t,q[1]+=(Math.cos(z.hue)*z.chroma+z.keep*q[1]-q[1])*t,q[2]+=(Math.sin(z.hue)*z.chroma+z.keep*q[2]-q[2])*t}if(Ct>0){let t=(O+mt.eps)/(Gr(e.depth,i,a)+mt.eps);[q[0],q[1],q[2]]=qr(q[0],q[1],q[2],Ct,t,Kr(F),We>1?Ct*(1-1/We):0,Dt)}if(kt>0){let t=(O+mt.eps)/(Gr(e.depth,i,a)+mt.eps);[q[0],q[1],q[2]]=Jr(q[0],q[1],q[2],kt,t)}if((l.toneGamma??1)!==1){let e=Pt(q[0],l.toneGamma),t=Ft(q[0],e,l.toneGamma,q[1],q[2]);q[0]=e,q[1]*=t,q[2]*=t}{let t=Math.hypot(q[1],q[2]),n=Nt.k*It;if(t>1e-6&&t<n){let r=q[1]*Math.cos(St.warmDir)+q[2]*Math.sin(St.warmDir),o=(1-Q(St.sLo,St.sHi,r))*Q(Nt.cLo,Nt.cHi,t)*(1-ze)*(1-Ee(l))*(1-kr(l,i,a)*(e.seabed??0)),s=1+(n/t-1)*o;q[1]*=s,q[2]*=s}}if([q[1],q[2]]=si(q[0],q[1],q[2]),ie>0){let t=1-Gt;[q[1],q[2]]=et(q[0],q[1],q[2],Q(K.wLo,K.wHi,ie)*t,Q(K.wLo,K.wHi,Zt)*t,Math.max($e(jt,Mt),$e(...Wr(e.depth,i,a)),yt(l)))}let gn=o?mi(t,n,r,m,h,y):1,_n=Math.max(It,mn*B.cMin*1.5,q[3]);e.lookTap&&e.lookTap(q[0],q[1],q[2],_n,gn,u.strength,e.fitLookGate??0,e.fitLookMix??0);let[vn,yn,bn]=Pr(q[0],q[1],q[2],_n,gn,e.fitLook??0,e.fitLookMix??0);if(e.trace){let t=e=>e.map(e=>+e.toFixed(3));Object.assign(e.trace,{subj:Je,srcC:t(j),redS:+be.toFixed(2),lin:t([m,h,y]),z:+oe.toFixed(2),k:+w.toFixed(2),conf:+ze.toFixed(2),veilScale:+se.toFixed(2),B:t(le),sig:+pe.toFixed(2),wSub:+ge.toFixed(2),full:t(xe),outPreLevels:t(I.map(e=>e)),Y:+L.toFixed(3),C:+Ht.toFixed(3),cMax:+Ut.toFixed(3),scale:+Wt.toFixed(2),o2:t([vn,yn,bn])})}return[t+(vn-t)*u.strength,n+(yn-n)*u.strength,r+(bn-r)*u.strength]}function Pr(e,t,n,r,i,a,o,s){let c=Je(e,t,n,a,o,s),l=O(c[0],c[1],c[2],r),[u,d,f]=E(c[0],l[0],l[1]),[p,m,h]=le(u*i,d*i,f*i);return[te(p),te(m),te(h)]}function Fr(e,t,n,r,i=1){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=i*Math.min(B.cMax,Math.max(B.keep*a,B.cMin*Q(B.lLo,B.lHi,e))),s=Math.cos(B.hue),c=Math.sin(B.hue),l=t*s+n*c,u=Math.max(0,1-r)**+B.side,d=l+(o-l)*r,f=s*d+(t-s*l)*u,p=c*d+(n-c*l)*u,m=Math.hypot(f,p),h=Math.min(B.floorKeep*a,B.floor*i);if(m>=h)return[f,p];let g=d>=0?s:t/a,_=d>=0?c:n/a,v=f*g+p*_,y=-v+Math.sqrt(Math.max(0,v*v-m*m+h*h));return[f+g*y,p+_*y]}function Ir(e){return Q(B.litLo,B.litHi,e)*(1-Q(H.hiLo,H.hiHi,e))}function Lr(e,t,n,r,i,a,o,s){let c=Math.hypot(t,n);return s<=0||c<1e-5?1:1-Z(s,0,1)*Q(_t.lLo,_t.lHi,e)*Q(0,_t.srcLo,r*a+i*o)*Q(0,_t.cross,-(t*a+n*o)/c)}function Rr(e,t,n,r,i){let a=Math.hypot(e,t),o=Math.hypot(n,r);if(i*=Q(.01,.04,o),i<=0||a<1e-4)return[e,t];let s=e/a,c=t/a,l=n/o,u=r/o,d=Math.cos(V.hueMax),f=Math.sin(V.hueMax);if(s*l+c*u>=d)return[e,t];let p=Math.sign(l*c-u*s),m=l*d-p*u*f,h=u*d+p*l*f,g=s+(m-s)*i,_=c+(h-c)*i,v=Math.hypot(g,_)||1;return[a*g/v,a*_/v]}function zr(e,t,n,r){let i=Math.min(Math.max(t*e.width-.5,0),e.width-1),a=Math.min(Math.max(n*e.height-.5,0),e.height-1),o=Math.floor(i),s=Math.floor(a),c=Math.min(o+1,e.width-1),l=Math.min(s+1,e.height-1),u=i-o,d=a-s,f=[0,0,0,0,0,0],p=(e,t,n,r)=>(e+(t-e)*u)*(1-d)+(n+(r-n)*u)*d;for(let i=0;i<4;i++){let a=e.data[(s*e.width+o)*4+i],m=e.data[(s*e.width+c)*4+i],h=e.data[(l*e.width+o)*4+i],g=e.data[(l*e.width+c)*4+i];if(i===0){let e=wr(a),t=wr(m),n=wr(h),r=wr(g);f[0]=p(e[0],t[0],n[0],r[0]),f[4]=p(e[1],t[1],n[1],r[1]),f[5]=p(e[2],t[2],n[2],r[2])}else f[i]=p(a,m,h,g);if(i===2&&r){let i=Math.min(a,m,h,g),p=Math.max(a,m,h,g);if(p-i>1e-4&&i<X.jbuHi&&p>X.jbuLo){let i=r(t,n);if(i>=0){let t=(t,n)=>r((t+.5)/e.width,(n+.5)/e.height),n=hr([(1-u)*(1-d),u*(1-d),(1-u)*d,u*d],[t(o,s),t(c,s),t(o,l),t(c,l)],i),p=n[0]+n[1]+n[2]+n[3];p>1e-5&&(f[2]=(n[0]*a+n[1]*m+n[2]*h+n[3]*g)/p)}}}}return f}function Br(e){return e>0?Q(X.popLo,X.popHi,e):0}function Vr(e,t,n,r,i,a){if(e[3]<=0)return 0;let o=(e[2]-.5)*2*X.alphaR,s=X.evFar+(1-X.evFar)*Z(e[4]??1,0,1),c=e[0]>=0&&e[0]<=2,l=c?Q(X.evLo*s,X.evHi*s,Math.hypot(t[0]-e[0],t[1]*r-t[2]*n)):1,u=l+(1-l)*Q(X.trustLo,X.trustHi,o);return Q(0,c?X.rampIn+(X.rampEv-X.rampIn)*l*Z(e[5]??0,0,1):X.rampIn,o)*u*Math.max(i,Br(e[3]))*e[1]*Math.min(1,H.popGate*a)}function Hr(e){return e[0]>2?e[0]-Cr:e[0]}function Ur(e,t,n,r){let i=Hr(e);if(i<0)return 1;let a=(e[2]-.5)*2*X.alphaR,o=X.evFar+(1-X.evFar)*Z(e[4]??1,0,1),s=Q(H.rimLo*o,H.rimHi*o,Math.hypot(t[0]-i,t[1]*r-t[2]*n));return s+(1-s)*Q(X.trustLo,X.trustHi,a)}function Wr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=t=>{let n=(n,r)=>e.guide[(r*e.width+n)*3+t];return(n(a,o)+(n(s,o)-n(a,o))*l)*(1-u)+(n(a,c)+(n(s,c)-n(a,c))*l)*u},f=T(Math.max(0,d(0)),Math.max(0,d(1)),Math.max(0,d(2)));return[f[1],f[2]]}function Gr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>{let r=(n*e.width+t)*3;return re(e.guide[r],e.guide[r+1],e.guide[r+2])};return(d(a,o)+(d(s,o)-d(a,o))*l)*(1-u)+(d(a,c)+(d(s,c)-d(a,c))*l)*u}function Kr(e){let t=(e[2]-.5)*2*X.alphaR,n=Z(e[4]??1,0,1);return Q(0,H.edge,t)*(H.farKeep+(1-H.farKeep)*n)}function qr(e,t,n,r,i,a=1,o=0,s=1){if(r<=0)return[e,t,n];let c=H,l=Z(s,0,1),u=1+(c.vib*Math.min(1,r)+c.boostVib*o)*a*(1-Q(c.vibLo,c.vibHi,Math.hypot(t,n)))*l,d=e*Z(i,c.rMin,c.rMax)**((c.detail*Math.min(1,r)+c.boostDetail*o)*l*(1-Q(c.hiLo,c.hiHi,e)));d+=(c.sep*Math.min(1,r)+c.boostSep*o)*l*4*d*Math.max(0,1-d)*(1-Q(c.hiLo,c.hiHi,e));let f=c.head*Math.max(0,1-e);return d>e&&(d=f>1e-5?e+f*(1-Math.exp(-(d-e)/f)):e),[d,t*u,n*u]}function Jr(e,t,n,r,i){if(r<=0||e<=1e-5)return[e,t,n];let a=U,o=Math.min(a.wMax,r),s=Q(a.spotLo,a.spotHi,i)*(1-Q(a.spotLLo,a.spotLHi,e)),c=Z(i,a.rMin,a.rMax)**+(a.detail*o)*(1-a.k*o*Q(a.toeLo,a.toeHi,e)*(1-s)+a.spot*o*s),l=Math.min(1,c)**+a.chroma;return[e*c,t*l,n*l]}function Z(e,t,n){return e<t?t:e>n?n:e}function Q(e,t,n){let r=Z((n-e)/(t-e),0,1);return r*r*(3-2*r)}function Yr(e,t,n,r,i){let a=Math.hypot(e,t);if(i<=0||a<1e-6)return[e,t];let o=Math.max(0,e*n+t*r),s=Math.max(0,(a-i*Math.min(gt.k*o,gt.cMax))*(1-i*gt.desat));return[e*s/a,t*s/a]}function Xr(e,t,n,r,i,a,o,s,c){if(c<=0||s<=0)return 0;let l=Math.hypot(t,n);if(l<1e-5)return 0;let u=(t*Math.cos(W.hue)+n*Math.sin(W.hue))/l,d=Q(Math.cos(W.bandOut),Math.cos(W.bandIn),u),f=1-Q(W.rLo,W.rHi,r/Math.max(1e-4,i,a)),p=Q(W.lLo,W.lHi,e);return c*W.mix*s*(d+(1-d)*f)*f*p*(1-o)}function Zr(e){return Q(W.confLo,W.confHi,e)}function Qr(e,t,n,r,i,a,o,s){if(s<=0)return 1;let c=Math.hypot(e,t);if(c<1e-5)return 1;let l=(e*Math.cos(W.warmHue)+t*Math.sin(W.warmHue))/c;return 1-s*(1-Q(W.rLo,W.rHi,n/Math.max(1e-4,r,i)))*Q(W.warmLo,W.warmHi,l)*(1-a)*(1-Z(o,0,1))}function $r(e,t,n){return 1-Q(W.rLo,W.rHi,e/Math.max(1e-4,t,n))}function ei(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n),a=Math.atan2(n,t),o=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),s=Math.max(1-Q(K.bandIn,K.bandOut,Math.abs(o(a-K.bandHue))),1-Q(K.achroma*.5,K.achroma,i)),c=Q(K.wLo,K.wHi,r)*s*Q(K.lLo,K.lHi,e)*(1-Q(K.cLo,K.cHi,i));if(c<=0)return[t,n];let l=a+o(K.hue-a)*K.mix*c,u=i+Math.max(0,K.cMin-i)*c;return[u*Math.cos(l),u*Math.sin(l)]}function ti(e,t,n,r,i,a,o=0){if(r<=0)return[e,t,n];let s=Math.hypot(t,n),c=Math.atan2(n,t),l=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),u=Q(G.keepLo,G.keepHi,s),d=(1-Q(G.warmIn,G.warmOut,Math.abs(l(c-G.warmHue))))*Q(G.warmLo+G.warmHaze*a,G.warmHi+G.warmHaze*a,s),f=Q(G.farLo,G.farHi,Math.abs(l(c-G.targetHue))),p=G.darkLo+(G.darkHi-G.darkLo)*(1-G.darkHaze*a),m=(1-u)*(1-d)*(1-Q(G.brightLo,G.brightHi,e))*Q(G.darkLo,p,e)*(1-G.farKeep*(1-a)*f)*r*G.mix,h=Math.max(0,e)**+(1+G.gamma*r)*(1-G.waterDim*r*i*(1-a)),g=Math.max(s,G.c0+G.c1*h),_=Math.max(s,(G.c0+G.c1*h)*(1+G.hazeChroma*a)),v=g+(G.objChroma-g)*a,y=v+(_-v)*Math.max(i,o),b=1-r*G.neutralDesat*(1-Q(G.neutralLo,G.neutralHi,s))*Q(G.neutralLLo,G.neutralLHi,e);return[h,(t+(y*Math.cos(G.targetHue)-t)*m)*b,(n+(y*Math.sin(G.targetHue)-n)*m)*b]}function ni(e,t,n,r,i){if(r<=0)return[e,t,n];let a=xt,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=a.target+(a.hiHue-a.target)*Q(a.hiHueLo,a.hiHueHi,e),u=s-l-2*Math.PI*Math.round((s-l)/(2*Math.PI)),d=Q(a.cLo,a.cHi,o)*Q(a.lLo,a.lHi,e),f=1-Q(a.bandHi0,a.bandHi1,c),p=Q(a.bandLo0,a.bandLo1,c)*f*(1-Q(a.violetCLo,a.violetCHi,o)*Q(a.target,a.bandHi1,c)),m=Q(a.greenLo0,a.greenLo1,c),h=m*(1-Q(a.greenTop0,a.greenTop1,c)),g=s+((1-i)*p*a.pull*(1-a.blueKeep*Q(0,a.blueSpan,u)*(1-Q(a.blueMax0,a.blueMax1,u)))*-u+i*h*a.greenShift)*d*r,_=(1-i)*p+i*m*f,v=Q(a.darkCLo,a.darkCHi,o),y=_*v*v*r;o*=1+a.chroma*y*(1-i);let b=e*(1-(a.dark+(a.darkGreen-a.dark)*i)*y*Q(a.darkLLo,a.darkLHi,e));b*=1-a.blackK*r*(1-Q(a.blackLo,a.blackHi,b));let x=a.shadowC0+a.shadowC1*Q(a.shadowLLo,a.shadowLHi,b);o>x&&(o-=(o-x)*(1-a.shadowKeep)*r*(1-Q(a.shadowFadeLo,a.shadowFadeHi,b)));let S=r*(1+(_-1)*Q(0,a.liftNeutralC,o))*Q(a.liftLLo,1,e);b+=a.lift*S*(1-b),o*=1-a.hiDesat*S;let C=a.warmC*S;return[b,o*Math.cos(g)+C*Math.cos(a.warmHue),o*Math.sin(g)+C*Math.sin(a.warmHue)]}function ri(e,t,n,r,i){if(r<=0)return[e,t,n,0];let a=St,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=Q(a.warmIn0,a.warmIn1,c)*(1-Q(a.warmOut0,a.warmOut1,c))*Q(a.warmCLo,a.warmCHi,o)*Q(a.warmLLo,a.warmLHi,e)*r,u=c+(a.warmHue-c)*a.warmPull*l,d=Math.max(o,Math.min(o*(1+a.warmGain*l),a.warmCMax)),f=d*Math.cos(u),p=d*Math.sin(u),m=t*Math.cos(a.warmDir)+n*Math.sin(a.warmDir),h=1-Q(a.sLo,a.sHi,m),g=Q(a.vcLo,a.vcHi,o)*Q(a.vio0,a.vio1,c)*(1-Q(a.vio2,2*Math.PI,c)),_=Q(a.neutralLLo,a.neutralLHi,e)*(1-Q(a.neutralCLo,a.neutralCHi,o)),v=Math.min(a.cMax,a.cK*e)*(1-a.hiDrop*Q(a.hiLo,a.hiHi,e)),y=Math.max(a.keepC*o,Math.min(v,Math.max(o,v*Q(a.darkLo,a.darkHi,e)))),b=a.target+(a.hiHue-a.target)*Q(a.hiHueLo,a.hiHueHi,e),x=Q(a.vegCLo,a.vegCHi,o)*Q(a.vegIn0,a.vegIn1,c)*(1-Q(a.vegOut0,a.vegOut1,c))*(1-a.vegGreen*i),S=Q(a.farLo,a.farHi,a.target-c)*Q(a.farMin0,a.farMin1,c)*Q(a.farCLo,a.farCHi,o),C=a.mix*h*(1-g)*(1-x)*(1-_)*Math.min(1,r*(1+a.farBoost*S));f+=(y*Math.cos(b)-f)*C,p+=(y*Math.sin(b)-p)*C;let ee=1-a.neutralK*_*h*r;return f*=ee,p*=ee,[e*(1-a.shadowK*r*(1-Q(0,a.shadowHi,e))),f,p,Math.max(y*C,d*l)]}function ii(e,t,n,r){if(n===0)return[e,t];let i=St,a=Math.hypot(e,t),o=Math.atan2(t,e),s=o<0?o+2*Math.PI:o,c=1-Q(i.sLo,i.sHi,e*Math.cos(i.warmDir)+t*Math.sin(i.warmDir)),l=Q(i.vcLo,i.vcHi,a)*Q(i.vio0,i.vio1,s)*(1-Q(i.vio2,2*Math.PI,s)),u=Q(i.vegCLo,i.vegCHi,a)*Q(i.vegIn0,i.vegIn1,s)*(1-Q(i.vegOut0,i.vegOut1,s))*(1-i.vegGreen*r),d=n*c*(1-l)*(1-u),f=Math.cos(d),p=Math.sin(d);return[e*f-t*p,e*p+t*f]}function ai(e,t,n,r){let i=Math.hypot(t,n);if(r<=0||i<1e-6)return[t,n];let a=Lt,o=Math.atan2(n,t),s=o<0?o+2*Math.PI:o,c=Q(a.warmIn0,a.warmIn1,s)*(1-Q(a.warmOut0,a.warmOut1,s)),l=Q(a.magIn0,a.magIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),u=Q(a.cLo,a.cHi,i)*Q(a.lLo,a.lHi,e)*(1-Q(a.hiLo,a.hiHi,e)),d=Q(a.coolIn0,a.coolIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),f=1+(a.gain*(1-a.coolCut*d)+a.warmGain*c)*(1-l)*u*r*Math.exp(-i/(a.top+(a.warmTop-a.top)*c));return[t*f,n*f]}function oi(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=Ct,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*Q(i.lLo,i.lHi,e)*(1-Q(i.cLo,i.cHi,r))*(1-Q(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function si(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=wt,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*Q(i.lLo,i.lHi,e)*(1-Q(i.cLo,i.cHi,r))*(1-Q(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function ci(e,t,n){return li(e,t,n,n.hueFarLo,n.hueFarHi)}function li(e,t,n,r,i){let a=Math.hypot(e,t);if(a<n.achroma)return 0;let[,o,s]=T(n.veilColor[0],n.veilColor[1],n.veilColor[2]),c=Math.hypot(o,s)||1,l=Math.max(-1,Math.min(1,(e*o/c+t*s/c)/a));return(1-Q(Math.cos(i),Math.cos(r),l))*Q(n.achroma,n.achroma*2,a)}function ui(e,t,n){let r=Math.hypot(e,t);if(r<n.achroma)return 1;let[,i,a]=T(n.veilColor[0],n.veilColor[1],n.veilColor[2]),o=Math.hypot(i,a)||1,s=Math.max(-1,Math.min(1,(e*i/o+t*a/o)/r)),c=1-Q(Math.cos(n.cosHi),Math.cos(n.cosLo),s),l=Q(n.achroma,n.achroma*2,r);return c+(1-c)*(1-l)}function di(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>e.fields[(n*e.width+t)*4+1];return(d(a,o)*(1-l)+d(s,o)*l)*(1-u)+(d(a,c)*(1-l)+d(s,c)*l)*u}const fi=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];function pi(e,t,n,r,i){let a=Math.min(1,Math.max(0,r)),o=0;for(let[r,i]of fi)o=Math.max(o,di(e,t+r*c.ringR/e.width,n+i*c.ringR/e.height));let s=Q(c.subjLo,c.subjHi,i),l=Q(c.coreIn,1,a)*Q(c.coreLo,c.coreHi,i);return Math.max(a*(s+(1-s)*l),Math.min(Math.min(1,o),s))}function mi(e,t,n,r,i,a){let o=re(ee(e),ee(t),ee(n)),s=re(r,i,a);return Z((o+mt.eps)/(s+mt.eps),mt.rMin,mt.rMax)}const hi=new WeakMap;function gi(e,t,n){let r=e.animals;if(!r)return[0,0];let i=e.strength??hi.get(r);i||(i=s(r).data,hi.set(r,i));let a=r.width,o=r.height,c=Math.min(a-1,Math.max(0,Math.floor(t*a))),l=Math.min(o-1,Math.max(0,Math.floor(n*o))),u=Math.min(Math.max(t*a-.5,0),a-1),d=Math.min(Math.max(n*o-.5,0),o-1),f=Math.floor(u),p=Math.floor(d),m=Math.min(f+1,a-1),h=Math.min(p+1,o-1),g=u-f,_=d-p,v=(e,t)=>i[(t*a+e)*4+1],y=(v(f,p)*(1-g)+v(m,p)*g)*(1-_)+(v(f,h)*(1-g)+v(m,h)*g)*_;return[i[(l*a+c)*4],y]}const $={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=T(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function _i(e,t,n,r){let i=t*n,a=new Float32Array(i),o=new Float32Array(i);for(let t=0;t<i;t++){let n=.2126*ne[e[t*4]]+.7152*ne[e[t*4+1]]+.0722*ne[e[t*4+2]];a[t]=n,o[t]=n*n}let s=Ci(a,t,n,2),c=Ci(o,t,n,2),[,l,u]=T(r[0],r[1],r[2]),d=Math.hypot(l,u)||1,f=Math.cos($.hueMax),p=[],m=Math.floor(n*(1-$.near)),h=0,g=0,_=0;for(let r=0;r<n;r+=2)for(let n=0;n<t;n+=2){h++,r>=m&&g++;let i=r*t+n;if(a[i]<$.lumMin)continue;let o=s[i],v=Math.sqrt(Math.max(0,c[i]-o*o));if(v<$.texLo*o||v>$.texHi*o)continue;let[,y,b]=T(ne[e[i*4]],ne[e[i*4+1]],ne[e[i*4+2]]),x=Math.hypot(y,b);x>$.cMax||x>$.achroma&&(y*l+b*u)/(x*d)<f||(p.push(i),r>=m&&_++)}let v=_/Math.max(1,g),y=v>=$.fracHi,b=y?p.filter(e=>e>=m*t):p,x=y?v:p.length/Math.max(1,h);return b.sort((e,t)=>a[t]-a[e]),{idx:b.slice(0,Math.ceil(b.length*$.top)),frac:x}}function vi(e,t,n,r,i,a,o){return s=>{let c=Dr({params:Si(i,s),settings:st,depth:a,clahe:o}),l=0,u=0,d=0;for(let i of r){let r=(i%t+.5)/t,a=(Math.floor(i/t)+.5)/n,o=Nr(c,e[i*4]/255,e[i*4+1]/255,e[i*4+2]/255,r,a);l+=ee(o[0]),u+=ee(o[1]),d+=ee(o[2])}let[,f,p]=T(l/r.length,u/r.length,d/r.length);return[f,p]}}function yi(e,t,n,r){let{idx:i,frac:a}=_i(e,t,n,r.veilColor);if(a<$.fracLo||i.length<12)return null;let o=Math.max(1,Math.floor(i.length/$.samples)),s=[];for(let e=0;e<i.length;e+=o)s.push(i[e]);return{pick:s,frac:a}}function bi(e,t,n,r,i,a){let o=yi(e,t,n,r);return o?{ab:vi(e,t,n,o.pick,r,i,a)([0,0]),frac:o.frac}:null}function xi(e,t,n,r,i,a,o){let s=yi(e,t,n,r);if(!s)return null;let{frac:c}=s,l=vi(e,t,n,s.pick,r,i,a),u=e=>Math.max(-$.maxLog,Math.min($.maxLog,e)),d=e=>Math.hypot(e[0]-o[0],e[1]-o[1]),f=[0,0],p=l(f),m=p;for(let e=0;e<$.iterations&&d(p)>$.tol;e++){let e=l([f[0]+$.eps,f[1]]),t=l([f[0],f[1]+$.eps]),n=(e[0]-p[0])/$.eps,r=(e[1]-p[1])/$.eps,i=(t[0]-p[0])/$.eps,a=(t[1]-p[1])/$.eps,s=n*a-i*r;if(!Number.isFinite(s)||Math.abs(s)<1e-6)break;let c=o[0]-p[0],m=o[1]-p[1],h=(a*c-i*m)/s,g=(-r*c+n*m)/s,_=Math.hypot(h,g);_>$.maxStep&&(h*=$.maxStep/_,g*=$.maxStep/_);let v=!1;for(let e=0;e<3&&!v;e++,h/=2,g/=2){let e=[u(f[0]+h),u(f[1]+g)],t=l(e);d(t)<d(p)&&(f=e,p=t,v=!0)}if(!v)break}return{log:f,frac:c,before:m,after:p}}function Si(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*$.water),a=Math.exp(t[1]*$.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}function Ci(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0,s=0;for(let i=Math.max(0,n-r);i<=Math.min(t-1,n+r);i++)o+=e[a*t+i],s++;i[a*t+n]=o/s}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0,c=0;for(let a=Math.max(0,e-r);a<=Math.min(n-1,e+r);a++)s+=i[a*t+o],c++;a[e*t+o]=s/c}return a}function wi(e,t,n=!1){let r=t.backdropFit??e.backdropFit,i={seabedNeed:t.seabedNeed??e.seabedNeed,seabedLw:t.seabedLw??e.seabedLw,seabedLb:t.seabedLb??e.seabedLb,seabedGrid:t.seabedGrid??e.seabedGrid},a=t.frameBlack??t.hazeBlack,o=Ti.margin>0&&e.hazeBlack>1e-6?Math.min(1,Ti.margin*a/e.hazeBlack):1,s={frameBlack:a,...o<1?{hazeBlack:e.hazeBlack*o,hazeFloor:e.hazeFloor.map(e=>e*o)}:{}};return n?{...e,...i,...s,backdropFit:r}:{...e,...i,...s,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}const Ti={margin:1.1},Ei={calmLo:.1,calmHi:.4,openLo:.05,openHi:.3},Di={trendTrust:.5,minSamples:4,kendall:.8,deadband:.1,stepMax:.6,maxRate:.1,maxSwing:Math.log(1.24),spreadLo:.06,spreadHi:.18,residual:.008};function Oi(e){let t=e.filter(e=>e.w>0&&Number.isFinite(e.log[0])&&Number.isFinite(e.log[1])).sort((e,t)=>e.t-t.t);if(!t.length)return null;let n=t.map(e=>e.w),r=e=>{let t=Ii(e,n),r=Ii(e.map(e=>Math.abs(e-t)),n);return t*(1-Mi(Di.spreadLo,Di.spreadHi,r))},i={t:[Ii(t.map(e=>e.t),n)],r:[r(t.map(e=>e.log[0]))],b:[r(t.map(e=>e.log[1]))]},a=t.filter(e=>e.w>=Di.trendTrust);if(a.length<Di.minSamples)return i;let o=a.map(e=>e.t),s=a.map(e=>e.w),c=ki(o,a.map(e=>e.log[0]),s);return!c||Math.abs(c[c.length-1]-c[0])<Di.deadband?i:{t:o,r:c,b:ki(o,a.map(e=>e.log[1]),s)??o.map(()=>Ii(a.map(e=>e.log[1]),s))}}function ki(e,t,n){let r=t.map((e,n)=>Pi(t[Math.max(0,n-1)],t[n],t[Math.min(t.length-1,n+1)])),i=Li(r);if(Math.abs(i)<Di.kendall)return null;let a=Ri(r,n,i>0),o=Math.abs(a[a.length-1]-a[0]);for(let e=1;e<a.length;e++)if(Math.abs(a[e]-a[e-1])>Di.stepMax*o)return null;let s=a.length>>1;for(let t=s+1;t<a.length;t++)a[t]=Fi(a[t],a[t-1],Di.maxRate*(e[t]-e[t-1]));for(let t=s-1;t>=0;t--)a[t]=Fi(a[t],a[t+1],Di.maxRate*(e[t+1]-e[t]));let c=Math.min(a[0],a[a.length-1]),l=Math.max(a[0],a[a.length-1]),u=l-c>Di.maxSwing?Di.maxSwing/(l-c):1,d=(c+l)/2;return a.map(e=>Math.max(-$.maxLog,Math.min($.maxLog,d+(e-d)*u)))}function Ai(e,t,n,r,i){let a=e.map((e,i)=>({px:e,t:t[i]??i,a:Wn(e,n,r)})),o=[],s=[];for(let e of a){if(ji(e.a.params)<.5)continue;let t=bi(e.px,n,r,wi(i,e.a.params),e.a.depth,e.a.clahe);!t||t.frac<$.fracHi||(o.push(t.ab[0]),s.push(t.ab[1]))}if(o.length<2)return null;let c=[Math.min(Ni(o),$.neutral[0]+$.pinkMax),Ni(s)],l=[];for(let e of a){let t=ji(e.a.params);if(t<=0)continue;let a=xi(e.px,n,r,wi(i,e.a.params),e.a.depth,e.a.clahe,c);if(!a)continue;let o=Math.max(Math.abs(a.log[0]),Math.abs(a.log[1]))>=$.maxLog-1e-6,s=Math.hypot(a.after[0]-c[0],a.after[1]-c[1])>Di.residual;!o&&!s&&l.push({t:e.t,log:a.log,w:Mi($.fracLo,$.fracHi,a.frac)*t})}return{target:c,curve:Oi(l),samples:l}}function ji(e){let t=Math.max(e.calm??0,e.calmTone??0),n=Mi(Ei.openLo,Ei.openHi,e.backdrop??0);return(1-Mi(Ei.calmLo,Ei.calmHi,t))*(1-n)*(1-Ee(e))}function Mi(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function Ni(e){let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function Pi(e,t,n){return Math.max(Math.min(e,t),Math.min(Math.max(e,t),n))}function Fi(e,t,n){return Math.max(t-n,Math.min(t+n,e))}function Ii(e,t){let n=e.map((e,n)=>({x:e,w:Math.max(0,t[n]??0)})).filter(e=>e.w>0).sort((e,t)=>e.x-t.x);if(!n.length)return 0;let r=n.reduce((e,t)=>e+t.w,0)/2,i=0;for(let e=0;e<n.length;e++){if(i+=n[e].w,Math.abs(i-r)<1e-12&&e+1<n.length)return(n[e].x+n[e+1].x)/2;if(i>r)return n[e].x}return n[n.length-1].x}function Li(e){let t=0,n=0;for(let r=0;r<e.length;r++)for(let i=r+1;i<e.length;i++)t+=Math.sign(e[i]-e[r]),n++;return n?t/n:0}function Ri(e,t,n){let r=n?e:e.map(e=>-e),i=[];for(let e=0;e<r.length;e++)for(i.push({sum:r[e]*t[e],w:t[e],n:1});i.length>1&&i[i.length-2].sum/i[i.length-2].w>i[i.length-1].sum/i[i.length-1].w;){let e=i.pop(),t=i[i.length-1];t.sum+=e.sum,t.w+=e.w,t.n+=e.n}let a=[];for(let e of i)for(let t=0;t<e.n;t++)a.push((n?1:-1)*(e.sum/e.w));return a}self.onmessage=e=>{if(e.data.kind===`balance`){let{id:t,width:n,height:r,shots:i}=e.data,a={kind:`balance`,id:t,shots:i.map(e=>{let t=Ai(e.thumbs.map(e=>new Uint8ClampedArray(e)),e.times,n,r,e.lock);return t?{target:t.target,curve:t.curve}:null})};self.postMessage(a);return}let{id:t,rgba:n,width:r,height:i,seeds:a}=e.data,o=performance.now(),s=Wn(new Uint8ClampedArray(n),r,i,{seeds:a}),c=an(s.depth),l=sn(s.depth),u=cn(s.clahe),d={id:t,params:s.params,mean:s.mean,fields:{width:s.depth.width,height:s.depth.height,data:c},guide:{width:s.depth.width,height:s.depth.height,data:l},clahe:{tilesX:s.clahe.tilesX,tilesY:s.clahe.tilesY,bins:s.clahe.bins,data:u},animals:s.depth.animals,blobs:s.depth.blobs,...s.depth.popConf?{popConf:s.depth.popConf}:{},ms:performance.now()-o},f=[c.buffer,l.buffer,u.buffer];s.depth.animals&&f.push(s.depth.animals.labels.buffer),s.depth.popConf&&f.push(s.depth.popConf.buffer),self.postMessage(d,f)};