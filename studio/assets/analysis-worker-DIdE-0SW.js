const e={thr:.25,minArea:.0012,covLo:.6,covHi:.75,weightLo:.5,weightHi:.8,core:.85,coreDev:.08,trimLo:.2,trimHi:.4,erode:2,holeMax:.3,matchIoU:.2,containK:.75,smallCells:160,nearK:.75,nearMin:2.5,nearRatio:2.5,nearIoU:.7,graceS:.35,stabLo:.4,stabHi:.6,confTau:.3,confLo:.4,confHi:.7,tauUp:1,tauDown:.5,leadMaxS:.4,leadMaxCells:12,dilate:2,tapReach:3,bindAhead:.3};function t(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function n(n,i,a,o,s,c,l){let u=a*o,d=new Int32Array(u).fill(-1),f=new Int32Array(u),p=[];for(let r=0;r<u;r++){if(d[r]>=0||n[r]<e.thr)continue;let s=p.length,c=0,m=0,h=0,g=0,_=0,v=0,y=0;for(f[c++]=r,d[r]=s;c>0;){let r=f[--c],u=r%a,p=(r-u)/a;m++,h+=u,g+=p,n[r]>_&&(_=n[r]),l&&l[r]>y&&(y=l[r]),v+=n[r]>=e.core?t(0,e.coreDev,i[r]):t(e.trimLo,e.trimHi,i[r]);for(let t=-1;t<=1;t++)for(let r=-1;r<=1;r++){let i=u+r,l=p+t;if((r|t)===0||i<0||l<0||i>=a||l>=o)continue;let m=l*a+i;d[m]<0&&n[m]>=e.thr&&(d[m]=s,f[c++]=m)}}p.push({area:m/u,sx:h,sy:g,weight:_*(1-y),cov:v/m,px:m})}let m=p.map((e,t)=>t).filter(t=>p[t].area>=e.minArea).sort((e,t)=>p[t].area-p[e].area).slice(0,255),h=new Int32Array(p.length).fill(0),g=[];for(let e of m){let t=p[e];g.push({cx:(t.sx/t.px+.5)*s/a-.5,cy:(t.sy/t.px+.5)*c/o-.5,area:t.area,weight:t.weight,coverage:t.cov}),h[e]=g.length}let _=new Uint8Array(s*c);for(let e=0;e<c;e++){let t=Math.min(o-1,Math.floor((e+.5)*o/c));for(let n=0;n<s;n++){let r=Math.min(a-1,Math.floor((n+.5)*a/s)),i=d[t*a+r];_[e*s+n]=i>=0?h[i]:0}}return r(_,s,c,g.length),{width:s,height:c,labels:_,list:g}}function r(t,n,r,i){let a=n*r,o=new Uint8Array(a),s=new Int32Array(a);for(let c=1;c<=i;c++){let i=0;for(let e=0;e<a;e++)t[e]===c&&i++;if(!i)continue;o.fill(0);let l=0;for(let e=0;e<n;e++)for(let i of[0,r-1]){let r=i*n+e;t[r]!==c&&!o[r]&&(o[r]=1,s[l++]=r)}for(let e=0;e<r;e++)for(let r of[0,n-1]){let i=e*n+r;t[i]!==c&&!o[i]&&(o[i]=1,s[l++]=i)}for(;l>0;){let e=s[--l],r=e%n;for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}for(let r=0;r<a;r++){if(o[r]||t[r]===c)continue;let u=[],d=!0;for(o[r]=1,s[l++]=r;l>0;){let e=s[--l],r=e%n;u.push(e),t[e]!==0&&(d=!1);for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}if(d&&u.length<=e.holeMax*i)for(let e of u)t[e]=c}}}function i(n){return t(e.weightLo,e.weightHi,n.weight)*t(e.covLo,e.covHi,n.coverage)}function a(e,t,n,r){if(r<=0)return e;let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0;for(let i=-r;i<=r;i++){let r=n+i;r>=0&&r<t&&(o=Math.max(o,e[a*t+r]))}i[a*t+n]=o}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0;for(let a=-r;a<=r;a++){let r=e+a;r>=0&&r<n&&(s=Math.max(s,i[r*t+o]))}a[e*t+o]=s}return a}function o(t,n,r){let i=a(t,n,r,e.dilate),o=e.erode,s=new Uint8Array(n*r);for(let e=0;e<r;e++){let r=0;for(let i=-o;i<n;i++){let a=+(i+o<n&&t[e*n+i+o]<=0),c=+(i-o-1>=0&&t[e*n+i-o-1]<=0);r+=a-c,i>=0&&(s[e*n+i]=+(t[e*n+i]>0&&r===0))}}let c=new Float32Array(n*r*4);for(let e=0;e<n;e++){let t=0;for(let a=-o;a<r;a++){let l=+(a+o<r&&!s[(a+o)*n+e]),u=+(a-o-1>=0&&!s[(a-o-1)*n+e]);if(t+=l-u,a>=0){let r=a*n+e;c[r*4]=i[r],c[r*4+1]=+(t===0)}}}return{width:n,height:r,data:c}}function s(e){let t=new Float32Array(e.width*e.height),n=e.list.map(i);for(let r=0;r<t.length;r++)e.labels[r]&&(t[r]=n[e.labels[r]-1]);return o(t,e.width,e.height)}const c={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,smallLo:.0015,smallHi:.0022,smallDevLo:.16,smallDevHi:.24,smallValidLo:.45,smallValidHi:.6,strongDevLo:.38,strongDevHi:.48,smallMax:14,clutterLo:18,clutterHi:24,lineThick:3,lineSpan:.9,rimShare:.7,rimSpan:.5,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3};function l(e,t,n){for(let n=0;n<6;n++){let r=n;for(let t=n+1;t<6;t++)Math.abs(e[t*6+n])>Math.abs(e[r*6+n])&&(r=t);if(Math.abs(e[r*6+n])<1e-12)return!1;if(r!==n){for(let t=0;t<6;t++){let i=e[n*6+t];e[n*6+t]=e[r*6+t],e[r*6+t]=i}let i=t[n];t[n]=t[r],t[r]=i}for(let r=n+1;r<6;r++){let i=e[r*6+n]/e[n*6+n];if(i!==0){for(let t=n;t<6;t++)e[r*6+t]-=i*e[n*6+t];t[r]-=i*t[n]}}}for(let r=5;r>=0;r--){let i=t[r];for(let t=r+1;t<6;t++)i-=e[r*6+t]*n[t];n[r]=i/e[r*6+r]}return!0}function u(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const d=c.abWeight*c.abWeight,f=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n,p=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n;function m(e,t,n,r,i,a,o,s,f){let m=i*a;o.fill(0,0,m),s?.fill(0),f?.fill(1,0,m);let g=c.step,_=Math.ceil(i/g),v=Math.ceil(a/g),y=_*v,b=new Float32Array(y),x=new Float32Array(y),S=new Float32Array(y),ee=new Float32Array(y),te=new Float32Array(y),ne=new Float32Array(y),re=0;for(let o=0,s=0;o<v;o++)for(let c=0;c<_;c++,s++){let l=Math.min(i-1,c*g),u=Math.min(a-1,o*g),d=u*i+l;b[s]=(l+.5)/i-.5,x[s]=(u+.5)/a-.5,S[s]=e[d],ee[s]=t[d],te[s]=n[d],ne[s]=r[d],re+=ne[s]}if(re<y*.3)return 0;let ie=new Float32Array(y).fill(1),C=new Float32Array(y),w=new Float64Array(36),T=new Float64Array(36),ae=new Float64Array(6),E=new Float64Array(6),oe=new Float64Array(6),se=new Float64Array(6),D=new Float64Array(6),ce=new Float64Array(6),O=new Float64Array(6),le=new Float64Array(6),ue=new Uint32Array(256),k=.05;for(let e=0;e<c.iterations;e++){w.fill(0),ae.fill(0),E.fill(0),oe.fill(0);for(let e=0;e<y;e++){let t=ne[e]*ie[e];if(t<=1e-6)continue;let n=b[e],r=x[e];le[0]=1,le[1]=n,le[2]=r,le[3]=n*n,le[4]=n*r,le[5]=r*r;for(let n=0;n<6;n++){let r=le[n]*t;for(let e=n;e<6;e++)w[n*6+e]+=r*le[e];ae[n]+=r*S[e],E[n]+=r*ee[e],oe[n]+=r*te[e]}}for(let e=0;e<6;e++)for(let t=0;t<e;t++)w[e*6+t]=w[t*6+e];if(T.set(w),se.set(ae),!l(T,se,D)||(T.set(w),se.set(E),!l(T,se,ce))||(T.set(w),se.set(oe),!l(T,se,O)))return 0;ue.fill(0);let e=0;for(let t=0;t<y;t++){let n=b[t],r=x[t],i=S[t]-p(D,n,r),a=ee[t]-p(ce,n,r),o=te[t]-p(O,n,r),s=Math.sqrt(i*i+d*(a*a+o*o));C[t]=s,ne[t]>.5&&(ue[Math.min(255,s*1e3|0)]++,e++)}if(e<50)return 0;let t=0,n=0;for(;n<256&&(t+=ue[n],!(t*2>=e));n++);k=Math.max(.004,1.4826*(n+.5)/1e3);for(let e=0;e<y;e++){let t=C[e]/(2.5*k);ie[e]=1/(1+t*t)}}let de=Math.min(c.devLo,c.inlierK*k),fe=0;for(let e=0;e<y;e++)C[e]<de&&fe++;let pe=u(c.inlierLo,c.inlierHi,fe/y)*(1-u(c.rmsLo,c.rmsHi,k));if(pe<=0)return 0;if(s)for(let e=0;e<6;e++)s[e]=D[e],s[6+e]=ce[e],s[12+e]=O[e];for(let r=0;r<a;r++){let s=(r+.5)/a-.5;for(let a=0;a<i;a++){let l=(a+.5)/i-.5,m=r*i+a,h=e[m]-p(D,l,s),g=h>0?h:h*c.darkWeight,_=t[m]-p(ce,l,s),v=n[m]-p(O,l,s),y=d*(_*_+v*v);if(o[m]=Math.sqrt(g*g+y),f){let e=h>0?h:h*c.vetoDark;f[m]=u(c.vetoLo,c.vetoHi,Math.sqrt(e*e+y))}}}let me=new Float32Array(m),A=new Float32Array(m);for(let e=1;e<a-1;e++)for(let t=1;t<i-1;t++){let n=e*i+t,r=o[n+1]-o[n-1],a=o[n+i]-o[n-i];me[n]=.5*Math.sqrt(r*r+a*a)}h(me,A,i,a,c.edgeRadius);let j=new Int32Array(m).fill(-1),he=new Int32Array(m);for(let e=0;e<m;e++){if(j[e]>=0||o[e]<c.devLo)continue;let t=0,n=0;for(he[t++]=e,j[e]=e;t>0;){let r=he[--t];A[r]>n&&(n=A[r]);let a=r%i;a>0&&j[r-1]<0&&o[r-1]>=c.devLo&&(j[r-1]=e,he[t++]=r-1),a<i-1&&j[r+1]<0&&o[r+1]>=c.devLo&&(j[r+1]=e,he[t++]=r+1),r>=i&&j[r-i]<0&&o[r-i]>=c.devLo&&(j[r-i]=e,he[t++]=r-i),r<m-i&&j[r+i]<0&&o[r+i]>=c.devLo&&(j[r+i]=e,he[t++]=r+i)}me[e]=n}for(let e=0;e<m;e++){let t=j[e]>=0?Math.max(A[e],me[j[e]]):A[e];o[e]=pe*u(c.devLo,c.devHi,o[e])*u(c.edgeLo,c.edgeHi,t)}return pe}function h(e,t,n,r,i){let a=new Float32Array(n*r),o=(e,t,n,r,a,o)=>{let s=2*i+1,c=new Float32Array(n+s),l=new Float32Array(n+s);for(let u=0;u<r;u++){let r=u*a,d=t=>{let a=t-i;return a<0||a>=n?0:e[r+a*o]},f=n+2*i;for(let e=0;e<f;e++)c[e]=e%s===0?d(e):Math.max(c[e-1],d(e));for(let e=f-1;e>=0;e--)l[e]=e===f-1||(e+1)%s===0?d(e):Math.max(l[e+1],d(e));for(let e=0;e<n;e++)t[r+e*o]=Math.max(l[e],c[e+2*i])}};o(e,a,n,r,n,1),o(a,t,r,n,1,n)}function g(e,t,n,r,i,a,o=c.vetoLo,s=c.vetoHi){return u(o,s,v(e,t,n,r,i,a))}function _(e,t,n){let r=e-.5,i=t-.5;return n[0]+n[1]*r+n[2]*i+n[3]*r*r+n[4]*r*i+n[5]*i*i}function v(e,t,n,r,i,a){let o=r-.5,s=i-.5,l=e=>a[e]+a[e+1]*o+a[e+2]*s+a[e+3]*o*o+a[e+4]*o*s+a[e+5]*s*s,u=e-l(0),f=u>0?u:u*c.vetoDark,p=t-l(6),m=n-l(12);return Math.sqrt(f*f+d*(p*p+m*m))}const y={minPx:10,maxArea:.5,splitPx:60};function b(e,t,n,r,i,a,o,s){let c=0,l=0,u=0,d=n,f=0,p=r,m=0;for(let r=0;r<t;r++){let t=e[r],a=t%n,o=(t-a)/n;c+=a,l+=o,u+=i[t],a<d&&(d=a),a>f&&(f=a),o<p&&(p=o),o>m&&(m=o)}let h=c/t,g=l/t,_=f-d>=m-p,v=i=>{let a=0,o=0,s=0;for(let r=0;r<t;r++){let t=e[r],c=t%n,l=(t-c)/n;i&&Math.sign(_?c-h:l-g)!==i||(a+=c,o+=l,s++)}if(!s)return null;a/=s,o/=s;let c=0,l=0,u=1/0;for(let r=0;r<t;r++){let t=e[r],s=t%n,d=(t-s)/n;if(i&&Math.sign(_?s-h:d-g)!==i)continue;let f=(s-a)**2+(d-o)**2;f<u&&(u=f,c=s,l=d)}return[(c+.5)/n,(l+.5)/r]},b=v(0),x=[b];if(t>=y.splitPx)for(let e of[-1,1]){let t=v(e);t&&x.push(t)}return{u:b[0],v:b[1],pts:x,x0:d/n,y0:p/r,x1:(f+1)/n,y1:(m+1)/r,area:t/(n*r),dev:u/t,accept:a,seeded:o,bubble:s}}function x(e,t,n,r,i,a,o,s,l,d,p,m,g,_,v){let x=r*i;if(a.fill(0,0,x),v?.fill(0,0,x),n<=0)return 0;let te=v?u(c.smallValidLo,c.smallValidHi,n):0,ne=[],re=0,ie=new Uint8Array(x);for(let e of d??[]){let t=Math.round(e.u*r-.5),n=Math.round(e.v*i-.5),a=c.seedR;for(let e=Math.max(0,n-a);e<=Math.min(i-1,n+a);e++)for(let n=Math.max(0,t-a);n<=Math.min(r-1,t+a);n++)ie[e*r+n]=1}let C=null;if(l){let e=new Float32Array(x);for(let t=0;t<x;t++)e[t]=+(l[t]<.5);C=new Float32Array(x),h(e,C,r,i,c.farMargin)}let w=0,T=new Int32Array(x).fill(-1),ae=new Int32Array(x),E=new Int32Array(x),oe=new Uint8Array(x),se=c.seedFrac*n,D=e=>{let n=e%r,i=(n<r-1?t[e+1]:t[e])-(n>0?t[e-1]:t[e]),a=(e<x-r?t[e+r]:t[e])-(e>=r?t[e-r]:t[e]);return .5*Math.sqrt(i*i+a*a)};for(let n=0;n<x;n++){if(T[n]>=0||C&&C[n]>0||e[n]<se&&t[n]<c.growDev)continue;let l=0,d=0,h=!1,ce=0,O=0,le=!1,ue=r,k=0,de=i,fe=0,pe=0,me=0,A=0,j=0;for(ae[l++]=n,T[n]=n;l>0;){let a=ae[--l];E[d++]=a;{let e=a%r,n=(a-e)/r;e<ue&&(ue=e),e>k&&(k=e),n<de&&(de=n),n>fe&&(fe=n),pe+=t[a],n<c.lineThick&&me++,e<c.lineThick&&A++,e>=r-c.lineThick&&j++}if(e[a]>=se&&(h=!0),ie[a]&&(le=!0),o&&s){let e=(a%r+.5)/r-.5,t=(Math.floor(a/r)+.5)/i-.5;o[a]-f(s,e,t)>c.lightDL&&O++}let u=D(a);u>ce&&(ce=u);let p=a%r,m=[p>0?a-1:-1,p<r-1?a+1:-1,a>=r?a-r:-1,a<x-r?a+r:-1];for(let r of m)r>=0&&T[r]<0&&!(C&&C[r]>0)&&(t[r]>=c.growDev||e[r]>=se)&&(T[r]=n,ae[l++]=r)}let he=h?1:u(c.growEdgeLo,c.growEdgeHi,ce),ge=k-ue+1,_e=fe-de+1;(ge>c.lineSpan*r&&_e<=c.lineThick||_e>c.lineSpan*i&&ge<=c.lineThick)&&(he=0),(me>=c.rimShare*d&&ge>c.rimSpan*r||Math.max(A,j)>=c.rimShare*d&&_e>c.rimSpan*i)&&(he=0);{let e=0;for(let t=0;t<d;t++)E[t]>=x-r&&e++;he*=1-u(c.bottomLo,c.bottomHi,e/r)}if(C){let e=0,t=0;for(let i=0;i<d;i++){let a=E[i],o=a%r,s=[o>0?a-1:-1,o<r-1?a+1:-1,a>=r?a-r:-1,a<x-r?a+r:-1];for(let r of s)r>=0&&T[r]!==n&&(e++,C[r]>0&&t++)}he*=1-u(c.farShareLo,c.farShareHi,t/Math.max(1,e))}let ve=o&&s&&p&&m?S(E,d,T,n,r,i,o,p,m,s,t):null;if(ve&&g){let e=ee(ve);if(e>0)for(let t=0;t<d;t++)g[E[t]]=e}let M=o&&s?u(c.lightShareLo,c.lightShareHi,O/d):1;if(w=Math.max(w,M*he*u(c.minArea,2*c.minArea,d/x)),v&&te>0&&h&&!le&&d/x<2*c.minArea){let n=he*te*u(c.smallLo,c.smallHi,d/x)*u(c.smallDevLo,c.smallDevHi,pe/d)*(1-(ve?ee(ve):0));if(n>0){let r=new Float32Array(d);for(let e=0;e<d;e++)r[e]=t[E[e]];r.sort();let i=c.relKeep*r[Math.min(d-1,Math.floor(.9*d))];ne.push({cells:E.slice(0,d).filter(n=>t[n]>=i||e[n]>=se),k:n,lit:M})}}d>=y.minPx&&re++,_&&d>=y.minPx&&d/x<=y.maxArea&&_.push(b(E,d,r,i,t,he,h,ve?ee(ve):0));let N=le?+(d/x>=.25*c.minArea):he*u(1.5*c.minArea,2*c.minArea,d/x);if(N<=0)continue;oe[n]=le?2:1;let ye=new Float32Array(d);for(let e=0;e<d;e++)ye[e]=t[E[e]];ye.sort();let P=c.relKeep*ye[Math.min(d-1,Math.floor(.9*d))];for(let n=0;n<d;n++)(t[E[n]]>=P||e[E[n]]>=se)&&(a[E[n]]=N)}let ce=new Float32Array(x);h(a,ce,r,i,c.closeR);for(let e=0;e<x;e++)ce[e]=1-ce[e];h(ce,a,r,i,c.closeR);for(let e=0;e<x;e++)a[e]=1-a[e];let O=new Uint8Array(x);for(let e=0;e<x;e++){if(O[e]||a[e]<=0)continue;let n=0,i=0,o=0,s=new Set;for(ae[n++]=e,O[e]=1;n>0;){let e=ae[--n];E[i++]=e,T[e]>=0&&oe[T[e]]&&s.add(T[e]),t[e]>=c.solidDev&&o++;let l=e%r;for(let t=-1;t<=1;t++)for(let i=-1;i<=1;i++){let o=l+i,s=e+t*r+i;(i|t)===0||o<0||o>=r||s<0||s>=x||O[s]||a[s]<=0||(O[s]=1,ae[n++]=s)}}let l=!1;for(let e of s)oe[e]===2&&(l=!0);let d=l?1:s.size>=c.schoolN?0:u(c.solidLo,c.solidHi,o/i);if(d<1&&v&&!l&&s.size<c.schoolN){let e=0;for(let n=0;n<i;n++)e+=t[E[n]];let n=u(c.strongDevLo,c.strongDevHi,e/i);if(n>d)for(let e=0;e<i;e++)v[E[e]]=Math.max(v[E[e]],a[E[e]]*n)}if(d<1)for(let e=0;e<i;e++)a[E[e]]*=d}let le=1-u(c.clutterLo,c.clutterHi,re);if(v&&ne.length&&ne.length<=c.smallMax&&le>0)for(let e of ne){let t=e.k*le;for(let n of e.cells)t>a[n]&&t>v[n]&&(v[n]=t);w=Math.max(w,e.lit*t)}return w}function S(e,t,n,r,i,a,o,s,c,l,u){let d=i*a,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=i,S=0,ee=a,te=0;for(let ne=0;ne<t;ne++){let t=e[ne],re=t%i,ie=(t-re)/i;y+=re,b+=ie,x=Math.min(x,re),S=Math.max(S,re),ee=Math.min(ee,ie),te=Math.max(te,ie);let C=(re+.5)/i-.5,w=(ie+.5)/a-.5,T=l[6]+l[7]*C+l[8]*w+l[9]*C*C+l[10]*C*w+l[11]*w*w,ae=l[12]+l[13]*C+l[14]*w+l[15]*C*C+l[16]*C*w+l[17]*w*w;h+=o[t]-f(l,C,w),g+=Math.hypot(s[t],c[t])/Math.max(.001,Math.hypot(T,ae));let E=re>0&&ie>0&&re<i-1&&ie<a-1;if(E&&n[t-1]===r&&n[t+1]===r&&n[t-i]===r&&n[t+i]===r)p+=Math.hypot(o[t+1]-o[t-1],o[t+i]-o[t-i])*.5,m++;else if(E){let e=0;for(let n=1;n<=2;n++)for(let r of[t-n,t+n,t-n*i,t+n*i])r>=0&&r<d&&(e=Math.max(e,Math.abs(u[t]-u[r])/n));_+=e,v++}}return{tex:m?p/m:0,dL:h/t,cr:g/t,aspect:(te-ee+1)/(S-x+1),sharp:v?_/v:0,cx:y/t,cy:b/t}}function ee(e){return(1-u(c.bubbleTexLo,c.bubbleTexHi,e.tex))*u(c.bubbleCrLo,c.bubbleCrHi,e.cr)*u(c.bubbleDLLo,c.bubbleDLHi,e.dL)*u(c.bubbleTallLo,c.bubbleTallHi,e.aspect)}function te(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function ne(e){return e<=0?0:e>=1?1:e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}const re=(()=>{let e=new Float32Array(256);for(let t=0;t<256;t++)e[t]=te(t/255);return e})();function ie(e,t,n){return .2126*e+.7152*t+.0722*n}const C=Math.cbrt;function w(e,t,n){let r=C(.4122214708*e+.5363325363*t+.0514459929*n),i=C(.2119034982*e+.6806995451*t+.1073969566*n),a=C(.0883024619*e+.2817188376*t+.6299787005*n);return[.2104542553*r+.793617785*i-.0040720468*a,1.9779984951*r-2.428592205*i+.4505937099*a,.0259040371*r+.7827717662*i-.808675766*a]}function T(e,t,n){let r=e+.3963377774*t+.2158037573*n,i=e-.1055613458*t-.0638541728*n,a=e-.0894841775*t-1.291485548*n,o=r*r*r,s=i*i*i,c=a*a*a;return[4.0767416621*o-3.3077115913*s+.2309699292*c,-1.2684380046*o+2.6097574011*s-.3413193965*c,-.0041960863*o-.7034186147*s+1.707614701*c]}function ae(e,t){let n=Math.atan2(t,e)*180/Math.PI;return n<0?n+360:n}const E=.7,oe=.7,se=.94;function D(e){return e[0]>=0&&e[1]>=0&&e[2]>=0&&e[0]<=1&&e[1]<=1&&e[2]<=1}function ce(e,t,n){let r=0,i=.4;for(let a=0;a<10;a++){let a=.5*(r+i);D(T(e,t*a,n*a))?r=a:i=a}return r}function O(e,t,n,r=0){let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=t/i,o=n/i,s=ce(e,a,o),c=oe*s;if(i<=c||s<=1e-5)return[t,n];let l=se*s-c,u=Math.min(i,r,se*s),d=Math.max(u,c+l*(1-Math.exp(-(i-c)/l)));return[a*d,o*d]}function le(e,t,n){let r=Math.max(e,t,n);if(r>1){let i=Math.max(E,1/r);e*=i,t*=i,n*=i}return ue(e,t,n)}function ue(e,t,n){let r=Math.min(1,Math.max(0,ie(e,t,n))),i=1,a=[e,t,n];for(let e=0;e<3;e++){let t=a[e];t>1?i=Math.min(i,(1-r)/(t-r)):t<0&&(i=Math.min(i,(0-r)/(t-r)))}return i>=1?[e,t,n]:(i=Math.max(0,i),[r+i*(e-r),r+i*(t-r),r+i*(n-r)])}const k={hueLo:-30*Math.PI/180,hueHi:70*Math.PI/180,warmC:.06,warmL:.2,warmLo:.012,warmHi:.05,rgY:.15,rgLo:.78,rgHi:.95,bgLo0:.45,bgLo1:.6,bgHi0:1.25,bgHi1:1.5,floorLo:.15,floorHi:.3,floorMin:.015,floorWarmLo:1.05,floorWarmHi:1.2,floorMagentaLo:.85,floorMagentaHi:1,hazeLo:.2,hazeHi:.35,redToneLo:.06,redToneHi:.12,colourMax:.9,toneMax:.9,toneLookOff:.4,knee:.97};function de(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const fe=1024,pe={rg:new Uint32Array(fe),bg:new Uint32Array(fe),r:new Uint32Array(fe),g:new Uint32Array(fe),b:new Uint32Array(fe)},me=.25;function A(e,t){return Math.min(fe-1,Math.max(0,fe/t*e|0))}function j(e,t,n,r){let i=n*t,a=0;for(let t=0;t<fe;t++)if(a+=e[t],a>=i)return(t+.5)*r/fe;return r}function he(e,t){for(let e of Object.values(pe))e.fill(0);let n=0,r=0,i=0,a=(k.hueLo+k.hueHi)/2,o=Math.cos(a),s=Math.sin(a),c=Math.cos((k.hueHi-k.hueLo)/2);for(let a=0;a<t;a+=3){let t=e[a*3],l=e[a*3+1],u=e[a*3+2];if(r++,pe.r[A(t,me)]++,pe.g[A(l,me)]++,pe.b[A(u,me)]++,.2126*t+.7152*l+.0722*u>=k.rgY){let e=1/Math.max(1e-4,l);pe.rg[A(t*e,4)]++,pe.bg[A(u*e,4)]++,i++}if(t<=l*.9)continue;let[d,f,p]=w(t,l,u),m=Math.hypot(f,p);d>=k.warmL&&m>=k.warmC&&(f*o+p*s)/m>=c&&n++}let l=n/Math.max(1,r),u=i>=r*.02,d=u?j(pe.rg,i,.5,4):0,f=u?j(pe.bg,i,.5,4):0,p=j(pe.r,r,.02,me),m=Math.max(j(pe.g,r,.02,me),j(pe.b,r,.02,me)),h=m<k.floorMin?1:p/m,g=de(k.rgLo,k.rgHi,d)*de(k.bgLo0,k.bgLo1,f)*(1-de(k.bgHi0,k.bgHi1,f))*de(k.floorLo,k.floorHi,h)*(1-de(k.floorWarmLo,k.floorWarmHi,h)*de(k.floorMagentaLo,k.floorMagentaHi,f));return{warm:l,rg:d,bg:f,floor:h,reds:de(k.warmLo,k.warmHi,l),noCast:g}}function ge(e,t){let n=1-de(k.hazeLo,k.hazeHi,t),r=e.noCast*n,i=de(k.redToneLo,k.redToneHi,e.warm)*n;return{calm:k.colourMax*Math.max(e.reds,r),calmTone:k.toneMax*Math.max(r,i)}}function _e(e){let t=Math.min(1,Math.max(0,e.calm??0)),n=Math.min(1,Math.max(0,e.calmTone??0));if(t<=0&&n<=0)return e;let r=e=>Math.max(1e-4,e)**(1-t),i=1-n;return{...e,wb:e.wb.map(r),waterWb:e.waterWb.map(r),attn:e.attn.map(e=>e*(1-t)),binf:e.binf.map(e=>e*(1-t)),exposure:Math.max(1e-4,e.exposure)**+i,levelsMix:e.levelsMix*i,toneGamma:1+((e.toneGamma??1)-1)*(1-Math.min(1,Math.max(t/k.colourMax,n/k.toneMax)/k.toneLookOff)),haze:e.haze*i,hazeBlack:e.hazeBlack*i,hazeFloor:e.hazeFloor.map(e=>e*i),knee:e.knee+(Math.max(e.knee,k.knee)-e.knee)*n}}function ve(e,t){let n=Math.min(1,Math.max(0,t.calmTone??0));return n<=0?e:{...e,clarity:e.clarity*(1-n),dehaze:e.dehaze*(1-n)}}const M=Math.PI/180,N={sigma:2,gainLo:1.25,gainHi:2,keepLo:15,keepHi:40,tolFrac:.35,tolLin:.004,snrLo:1.5,snrHi:6,snrMin:.25,waterRed:.8,waterSnrLo:4,waterSnrHi:12,hue:15*M,bandIn:35*M,bandOut:60*M,cMax:.15,knee:.65,pinkHue:5*M,pinkIn:40*M,pinkOut:60*M,whiteLo:.55,whiteHi:.78,whiteC:.015,magHue:335*M,magIn:35*M,magOut:55*M,magLLo:.35,magLHi:.5,magDir:45*M,magSrcLo:-.008,magSrcHi:.004,magCLo:.05,magCHi:.12,skinHueMin:15*M,skinCMax:.085,skinSrcCLo:.07,skinSrcCHi:.11,greenLo:1.15,greenHi:1.8,greenRMax:5,greenBMax:3,greenWater:.7,greenDehaze:.85,greenObj:.9,greenProp:.6,greenWarmR:1.1,greenWarmB:.9,veilGreenLo:1.35,veilGreenHi:1.85,veilChromaLo:.03,veilChromaHi:.06,greenLevelLo:.03,greenLevelHi:.08,gnHue:150*M,gnIn:20*M,gnOut:45*M,gnMix:.75,gnObjKeep:.7,gnTargetHue:240*M,gnTargetC:.012,matHue:70*M,matIn:40*M,matOut:65*M,matC:.05,matKnee:.6,litLo:.35,litHi:.55,litSub:3,murkHold:1,murkDark:.75,murkLo:.08,murkHi:.25};function ye(e,t,n){return e<t?t:e>n?n:e}function P(e,t,n){let r=ye((n-e)/(t-e),0,1);return r*r*(3-2*r)}function be(e,t){return Ce(e,t)*(1-Se(t))}function xe(e,t){return Ce(e,t)*Se(t)}function Se(e){return e?P(N.litLo,N.litHi,.2126*e[0]+.7152*e[1]+.0722*e[2]):0}function Ce(e,t){let n=P(N.greenLo,N.greenHi,e[1]/Math.max(1e-4,e[2])),r=t?P(N.veilGreenLo,N.veilGreenHi,t[1]/Math.max(1e-4,t[2]))*P(N.veilChromaLo,N.veilChromaHi,we(t)):0;return Math.max(n,r)*P(N.greenLevelLo,N.greenLevelHi,e[1])}function we(e){let[,t,n]=w(Math.max(0,e[0]),Math.max(0,e[1]),Math.max(0,e[2]));return Math.hypot(t,n)}function Te(e){return be(e.binf,e.veilColor)*(1-Math.min(1,Math.max(0,e.calm??0)))}function Ee(e,t){let n=N.greenDehaze*Te(t);return n>e.dehaze?{...e,dehaze:Math.min(1,n)}:e}function De(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=P(Math.cos(N.gnOut),Math.cos(N.gnIn),(t*Math.cos(N.gnHue)+n*Math.sin(N.gnHue))/i),o=N.gnMix*r*a,s=N.gnTargetC*ye(e/.6,0,1.3);return[t+(s*Math.cos(N.gnTargetHue)-t)*o,n+(s*Math.sin(N.gnTargetHue)-n)*o]}function Oe(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of y){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*.12*.12));h+=f*c,g+=f*l,_+=f*u,v+=f}if(v<1e-6)return[r,i,a];let b=Math.min(1,v/.08);return[r+(h/v-r)*b,i+(g/v-i)*b,a+(_/v-a)*b]}function ke(e,t){return 255*Math.max(0,ne(Math.max(0,e))-ne(Math.max(0,Math.min(e,t))))/N.sigma}function Ae(e,t,n,r){let i=[0,0,0],a=0;for(let e=0;e<3;e++){let o=ke(t[e],r[e]);e===0&&(a=o),i[e]=P(N.gainLo,N.gainHi,n[e]/Math.max(1e-4,n[1]))*(1-P(N.keepLo,N.keepHi,o))}let o=[.2126,.7152,.0722],s=0,c=0;for(let n=0;n<3;n++){let r=o[n]*(1-.95*i[n]);s+=r*e[n],c+=r*t[n]}let l=c>1e-6?s/c:1,u=[e[0],e[1],e[2]];for(let n=0;n<3;n++){let r=N.tolFrac*e[n]+N.tolLin,a=ye(t[n]*l,e[n]-r,e[n]+r);u[n]=e[n]+(a-e[n])*i[n]}return{c:u,snrR:a}}function je(e,t,n){let r=N.waterRed*P(N.waterSnrLo,N.waterSnrHi,n);return e*Math.max(1,t/Math.max(1e-4,e))**+r}function Me(e,t,n,r,i){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=N.matKnee*N.matC;if(a<=o)return[t,n];let s=P(Math.cos(N.matOut),Math.cos(N.matIn),(t*Math.cos(N.matHue)+n*Math.sin(N.matHue))/a),c=r*(1-i)*s*P(.2,.3,e)*(1-P(.85,.95,e));if(c<=0)return[t,n];let l=N.matC-o,u=a+(o+l*(1-Math.exp(-(a-o)/l))-a)*c;return[t*u/a,n*u/a]}function Ne(e,t,n){let r=t*(N.murkDark+(1-N.murkDark)*P(N.murkLo,N.murkHi,t));return n<=0||e<=r?e:e+(r-e)*n*N.murkHold}function Pe(e){return N.snrMin+(1-N.snrMin)*P(N.snrLo,N.snrHi,e)}function Fe(e,t,n,r,i,a,o){let s=Math.hypot(t,n);if(s<1e-5)return[t,n];let c=P(Math.cos(N.bandOut),Math.cos(N.bandIn),(t*Math.cos(N.hue)+n*Math.sin(N.hue))/s),l=P(Math.cos(N.pinkOut),Math.cos(N.pinkIn),(t*Math.cos(N.pinkHue)+n*Math.sin(N.pinkHue))/s),u=Math.hypot(r,i),d=P(.1,.5,a)*(1-P(N.skinSrcCLo,N.skinSrcCHi,u))*(1-o)*P(.3,.45,e),f=Math.atan2(n,t);if(d>0){let e=f<N.skinHueMin&&f>-Math.PI/2?N.skinHueMin:f;f+=(e-f)*d}let p=N.cMax+(N.whiteC-N.cMax)*P(N.whiteLo,N.whiteHi,e)*l*(1-d),m=P(Math.cos(N.magOut),Math.cos(N.magIn),(t*Math.cos(N.magHue)+n*Math.sin(N.magHue))/s)*(1-P(N.magSrcLo,N.magSrcHi,r*Math.cos(N.magDir)+i*Math.sin(N.magDir)))*P(N.magLLo,N.magLHi,e)*(1-P(N.magCLo,N.magCHi,s))*(1-d);p=Math.min(p,N.cMax+(N.whiteC-N.cMax)*m),p+=(Math.min(p,N.skinCMax)-p)*d;let h=u>1e-5?(r*Math.cos(N.hue)+i*Math.sin(N.hue))/u:0,g=u*P(Math.cos(N.bandOut),Math.cos(N.bandIn),h);p=Math.max(p,g);let _=Math.max(c,l,d,m),v=Math.max(N.knee*p,g),y=s;if(y>v&&_>0){let e=p-v,t=v+e*(1-Math.exp(-(y-v)/Math.max(1e-6,e)));y+=(t-y)*_}return y===s&&d<=0?[t,n]:[y*Math.cos(f),y*Math.sin(f)]}const Ie=`
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
`,Le=Ie.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),Re=`${Ie}
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
}`,ze=`${Le}
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
}`,Be=[`sh`,`mid`,`hi`,`rot`,`sat`,`coolSat`,`warmSat`,`satL`,`shA`,`shB`,`hiA`,`hiB`],Ve={sh:0,mid:0,hi:0,rot:0,sat:0,coolSat:0,warmSat:0,satL:0,shA:0,shB:0,hiA:0,hiB:0};25*Math.PI/180;const He={cool:240*Math.PI/180,coolIn:50*Math.PI/180,coolOut:95*Math.PI/180,warm:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:80*Math.PI/180,protLo:.015,protHi:.05},Ue={vivid:{...Ve},blue:{...Ve}},F=e=>Math.min(1,Math.max(0,e));function We(e,t,n){let r=F((n-e)/(t-e));return r*r*(3-2*r)}const Ge=256/27;function Ke(e){let t=F(e),n=1-t;return[Ge*t*n*n*n,16*t*t*n*n,Ge*t*t*t*n]}const qe=(e,t,n)=>{if(n<=0)return e;let r={...e};for(let i of Be)r[i]=e[i]+(t[i]-e[i])*n;return r};function Je(e,t,n,r,i=0,a=Ue){if(r<=0)return[e,t,n];let o=qe(a.vivid,a.blue,F(i)),s=He,c=F(e),[l,u,d]=Ke(c),f=e+r*(o.sh*l+o.mid*u+o.hi*d),p=Math.hypot(t,n),m=0,h=0;if(p>1e-6){let e=Math.atan2(n,t),r=t=>{let n=e-t;return Math.abs(n-2*Math.PI*Math.round(n/(2*Math.PI)))};m=1-We(s.coolIn,s.coolOut,r(s.cool)),h=1-We(s.warmIn,s.warmOut,r(s.warm))}let g=r*o.rot*m,_=Math.cos(g),v=Math.sin(g),y=Math.max(0,1+r*(o.sat+o.coolSat*m+o.warmSat*h+o.satL*(2*c-1))),b=r*(1-h*We(s.protLo,s.protHi,p));return[f,(t*_-n*v)*y+b*(o.shA*l+o.hiA*d),(t*v+n*_)*y+b*(o.shB*l+o.hiB*d)]}const I=e=>Be.every(t=>e[t]===0);function Ye(e,t,n=Ue){let r=Ze(t);return r<1&&!I(n.vivid)||r>0&&!I(n.blue)?Xe(e,t):0}function Xe(e,t){let n=F(Math.max(e.calm??0,e.calmTone??0)),r=Ze(t),i=F(e.vividGate??1),a=i+(F(e.blueGate??e.vividGate??1)-i)*r;return F(t.vivid??0)*(1-We(Ct.calmLo,Ct.calmHi,n))*(1-We(Pt.calmLo,Pt.calmHi,n))*a}function Ze(e){return F(e.blue??0)}const Qe={hue:45*Math.PI/180,warmIn:60*Math.PI/180,warmOut:100*Math.PI/180,hueKeep:.4,knee:.05,cap:.08,rest:.03,restMix:.5,coolCut:.85,srcLo:.035,srcHi:.065,coolLo:.03,coolHi:.055,lLo:.3,lHi:.45,hiLo:.86,hiHi:.95};function $e(e,t){let n=Qe,r=Math.hypot(e,t);return r<1e-6?0:We(n.srcLo,n.srcHi,r)*(1-We(Math.cos(n.warmOut),Math.cos(n.warmIn),(e*Math.cos(n.hue)+t*Math.sin(n.hue))/r))}function et(e,t,n,r,i,a=0){if(r<=0&&i<=0)return[t,n];let o=Qe,s=Math.cos(o.hue),c=Math.sin(o.hue),l=Math.hypot(t,n),u=t*s+n*c,d=n*s-t*c,f=l>1e-6?We(Math.cos(o.warmOut),Math.cos(o.warmIn),u/l):0,p=F(r)*f;d*=1-(1-o.hueKeep)*p;let m=Math.hypot(u,d),h=1-o.coolCut*F(a),g=o.knee*h,_=(o.cap-o.knee)*h;if(m>g){let e=1+((g+_*(1-Math.exp(-(m-g)/_)))/m-1)*p;u*=e,d*=e}let v=F(i)*o.restMix*We(o.lLo,o.lHi,e)*(1-We(o.hiLo,o.hiHi,e))*(1-We(o.coolLo,o.coolHi,l));return u+=(Math.max(u,o.rest)-u)*v,d*=1-v,[u*s-d*c,u*c+d*s]}const L=e=>{let t=e.toFixed(7).replace(/0+$/,``);return t.endsWith(`.`)?t+`0`:t},tt=e=>t=>`mix(${L(e.vivid[t])}, ${L(e.blue[t])}, m)`,R=He,z=Qe;function nt(e=Ue){let t=tt(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
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
    cool = 1.0 - smoothstepf(${L(R.coolIn)}, ${L(R.coolOut)}, fitLookDist(h, ${L(R.cool)}));
    warm = 1.0 - smoothstepf(${L(R.warmIn)}, ${L(R.warmOut)}, fitLookDist(h, ${L(R.warm)}));
  }
  float ang = t * ${t(`rot`)} * cool, cs = cos(ang), sn = sin(ang);
  float k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  float tw = t * (1.0 - warm * smoothstepf(${L(R.protLo)}, ${L(R.protHi)}, C));
  return vec3(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
float skinGuardCool(vec2 ab0) {
  float C = length(ab0);
  if (C < 1e-6) return 0.0;
  return smoothstepf(${L(z.srcLo)}, ${L(z.srcHi)}, C) * (1.0 - smoothstepf(${L(Math.cos(z.warmOut))}, ${L(Math.cos(z.warmIn))}, dot(ab0, vec2(${L(Math.cos(z.hue))}, ${L(Math.sin(z.hue))})) / C));
}
vec2 skinGuard(vec3 lab, float cap, float rest, float cool) {
  if (cap <= 0.0 && rest <= 0.0) return lab.yz;
  vec2 d = vec2(${L(Math.cos(z.hue))}, ${L(Math.sin(z.hue))});
  float C = length(lab.yz);
  float s = dot(lab.yz, d), o = lab.z * d.x - lab.y * d.y;
  float warm = C > 1e-6 ? smoothstepf(${L(Math.cos(z.warmOut))}, ${L(Math.cos(z.warmIn))}, s / C) : 0.0;
  float kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${L(1-z.hueKeep)} * kw;
  float C1 = length(vec2(s, o));
  float lim = 1.0 - ${L(z.coolCut)} * clamp(cool, 0.0, 1.0), knee = ${L(z.knee)} * lim, room = ${L(z.cap-z.knee)} * lim;
  if (C1 > knee) {
    float q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  float kr = clamp(rest, 0.0, 1.0) * ${L(z.restMix)} * smoothstepf(${L(z.lLo)}, ${L(z.lHi)}, lab.x) * (1.0 - smoothstepf(${L(z.hiLo)}, ${L(z.hiHi)}, lab.x)) * (1.0 - smoothstepf(${L(z.coolLo)}, ${L(z.coolHi)}, C));
  s += (max(s, ${L(z.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2(s * d.x - o * d.y, s * d.y + o * d.x);
}`}function rt(e=Ue){let t=tt(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
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
    cool = 1.0 - smoothstepf(${L(R.coolIn)}, ${L(R.coolOut)}, fitLookDist(h, ${L(R.cool)}));
    warm = 1.0 - smoothstepf(${L(R.warmIn)}, ${L(R.warmOut)}, fitLookDist(h, ${L(R.warm)}));
  }
  let ang = t * ${t(`rot`)} * cool;
  let cs = cos(ang);
  let sn = sin(ang);
  let k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  let tw = t * (1.0 - warm * smoothstepf(${L(R.protLo)}, ${L(R.protHi)}, C));
  return vec3<f32>(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
fn skinGuardCool(ab0: vec2<f32>) -> f32 {
  let C = length(ab0);
  if (C < 1e-6) { return 0.0; }
  return smoothstepf(${L(z.srcLo)}, ${L(z.srcHi)}, C) * (1.0 - smoothstepf(${L(Math.cos(z.warmOut))}, ${L(Math.cos(z.warmIn))}, dot(ab0, vec2<f32>(${L(Math.cos(z.hue))}, ${L(Math.sin(z.hue))})) / C));
}
fn skinGuard(lab: vec3<f32>, cap: f32, rest: f32, cool: f32) -> vec2<f32> {
  if (cap <= 0.0 && rest <= 0.0) { return lab.yz; }
  let d = vec2<f32>(${L(Math.cos(z.hue))}, ${L(Math.sin(z.hue))});
  let C = length(lab.yz);
  var s = dot(lab.yz, d);
  var o = lab.z * d.x - lab.y * d.y;
  var warm = 0.0;
  if (C > 1e-6) { warm = smoothstepf(${L(Math.cos(z.warmOut))}, ${L(Math.cos(z.warmIn))}, s / C); }
  let kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${L(1-z.hueKeep)} * kw;
  let C1 = length(vec2<f32>(s, o));
  let lim = 1.0 - ${L(z.coolCut)} * clamp(cool, 0.0, 1.0);
  let knee = ${L(z.knee)} * lim;
  let room = ${L(z.cap-z.knee)} * lim;
  if (C1 > knee) {
    let q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  let kr = clamp(rest, 0.0, 1.0) * ${L(z.restMix)} * smoothstepf(${L(z.lLo)}, ${L(z.lHi)}, lab.x) * (1.0 - smoothstepf(${L(z.hiLo)}, ${L(z.hiHi)}, lab.x)) * (1.0 - smoothstepf(${L(z.coolLo)}, ${L(z.coolHi)}, C));
  s += (max(s, ${L(z.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2<f32>(s * d.x - o * d.y, s * d.y + o * d.x);
}`}const it={mu0:.53214829,mu1:.51309827,mu2:-.91066194},at={auto:{red:1,blue:1,redMax:5,dehaze:0,clarity:0,exposure:1,hazeLift:0},murky:{red:1.1,blue:1.2,redMax:5,dehaze:.65,clarity:.35,exposure:1.1,hazeLift:.9},deep:{red:1.5,blue:.9,redMax:5,dehaze:.25,clarity:.15,exposure:1.05,hazeLift:.5},reef:{red:1,blue:1,redMax:1.6,dehaze:0,clarity:-.1,exposure:.97,hazeLift:0}},ot={intensity:1,saturation:1,clarity:.15,veil:.7,look:0,preset:`auto`,subjectPop:!1,subjectPopStrength:.5,subjectPopWarmth:.5,seabed:.6,vivid:0,blue:0,noiseReduction:`auto`},st={lo:.55,hi:.78},ct={lo:.06,hi:.18},lt={lo:.05,hi:.2},ut={floor:.25,soft:.12,chroma:.7,farKeep:.6};function dt(e,t){if(t<=0||e.hazeBlack<=0)return[0,0,0];let n=ut.chroma;return e.hazeFloor.map(r=>t*((1-n)*e.hazeBlack+n*Math.min(Math.max(r,0),2*e.hazeBlack)))}function ft(e,t){if(t<=0)return 1;let n=(e-t)/((1-t)*Math.max(e,1e-6)),r=n-ut.floor,i=1-ut.floor,a=ut.soft*ut.soft;return .5*(n+ut.floor+Math.sqrt(r*r+a))-.5*(Math.sqrt(i*i+a)-i)}const pt={sigma:.009,k:1/(6*.009*.009),eps:.004,rMin:.5,rMax:2},mt=[[-2.5,-2.5,1],[2.5,-2.5,1],[-2.5,2.5,1],[2.5,2.5,1],[-6.5,-1.5,.7],[6.5,1.5,.7],[-1.5,6.5,.7],[1.5,-6.5,.7],[-6.5,1.5,.7],[6.5,-1.5,.7],[1.5,6.5,.7],[-1.5,-6.5,.7]],ht={k:0,cMax:0,desat:-.4,edgeFloor:0},B={hue:75*Math.PI/180,chroma:.02,keep:.35,lift:.06,grid:6,wLo:.1,wHi:.8,lo:.1,span:.8,redLo:.12,redHi:.35,bandLo:-.1,bandHi:-.02,y0:.2,y1:.5},V={hue:65*Math.PI/180,cMin:.026,cMax:.034,keep:.25,lLo:.2,lHi:.55,wLo:.03,wHi:.3,side:4,castLo:.015,castHi:.045,litLo:.3,litHi:.5,upLo:-.03,upHi:.05,floor:.018,floorKeep:.5,engineTone:.35,amount:0},H={vividKeep:.8,clarity:.3,lift:.2,hiLo:.62,hiHi:.9,waterLo:.05,waterHi:.12,chromaFollow:.3,chromaFollowDark:.7,engineKeep:.5,keepDarkLo:.25,keepDarkHi:.4,darkLo:.2,darkHi:.45,hueMax:20*Math.PI/180},U={darkLo:.1,darkHi:.28,popGate:4,sep:.13,boostSep:.04,sepRange:.12,sepClose:1.3,head:.4,vib:.45,boostVib:.15,vibLo:.06,vibHi:.12,rimLo:.07,rimHi:.15,thick:9,hue:65*Math.PI/180,hiLo:.7,hiHi:.9,detail:.8,rMin:1,rMax:1.45,boostDetail:.7,edge:3,farKeep:.35,veilLo:.065,veilHi:.125,pack:32,levels:16},W={k:.3,range:.2,toeLo:0,toeHi:.12,detail:.4,rMin:.85,rMax:1.25,chroma:1,engine:1,engineLo:.12,engineHi:.3,wMax:1.5,farKeep:.3,farLit:.45,farLo:.07,farHi:.15,bed:.4,spot:.06,spotLo:1.1,spotHi:1.35,spotLLo:.45,spotLHi:.65},gt={lLo:.72,lHi:.86,cross:.5,srcLo:.004};function _t(e){return 2*Math.min(1,Math.max(0,e.subjectPopStrength??.5))}const G={hue:195*Math.PI/180,bandIn:45*Math.PI/180,bandOut:85*Math.PI/180,rLo:.08,rHi:.3,mix:.92,silver:.022,lLo:.12,lHi:.32,farLo:30*Math.PI/180,farHi:60*Math.PI/180,lift:.05,confLo:.05,confHi:.5,warmHue:50*Math.PI/180,warmLo:.1,warmHi:.5};function vt(e){return Math.min(1,Math.max(0,e.backdrop??0))*(1-Math.min(1,Math.max(0,e.calmTone??0)))}const yt={cLo:.06,cHi:.12,keep:.95},K={gamma:0,dim:.5,liftRelief:.6,liftRef:.1,hazeDehaze:.4,hazeClarity:.4,hazeLevels:.15,waterDim:.25,hazeLo:.05,hazeHi:.3,hazeChroma:2,deepLo:.35,deepHi:.8,objChroma:.045,neutralDesat:.8,neutralLo:.025,neutralHi:.05,neutralLLo:.65,neutralLHi:.8,warmHue:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:70*Math.PI/180,warmLo:.006,warmHi:.015,warmHaze:.06,brightLo:.6,brightHi:.8,keepLo:.09,keepHi:.14,targetHue:252*Math.PI/180,c0:0,c1:.11,darkLo:.08,darkHi:.45,darkHaze:.6,farLo:50*Math.PI/180,farHi:110*Math.PI/180,farKeep:.55,mix:.8},bt={target:242*Math.PI/180,pull:.6,bandLo0:130*Math.PI/180,bandLo1:225*Math.PI/180,bandHi0:255*Math.PI/180,bandHi1:305*Math.PI/180,violetCLo:.08,violetCHi:.14,greenShift:22*Math.PI/180,greenLo0:85*Math.PI/180,greenLo1:125*Math.PI/180,greenTop0:205*Math.PI/180,greenTop1:240*Math.PI/180,cLo:0,cHi:.1,lLo:.15,lHi:.4,chroma:.25,dark:.06,darkGreen:.04,darkLLo:.3,darkLHi:.6,darkCLo:.015,darkCHi:.16,blackK:.1,blackLo:0,blackHi:.25,shadowC0:.006,shadowC1:.1,shadowLLo:.15,shadowLHi:.6,shadowKeep:.5,shadowFadeLo:.35,shadowFadeHi:.55,liftLLo:.9,liftNeutralC:.04,lift:.08,hiDesat:.45,warmC:.006,warmHue:80*Math.PI/180},xt={target:258*Math.PI/180,mix:.9,warmDir:45*Math.PI/180,sLo:-.05,sHi:.03,vcLo:.07,vcHi:.12,vio0:285*Math.PI/180,vio1:310*Math.PI/180,vio2:345*Math.PI/180,vegIn0:60*Math.PI/180,vegIn1:80*Math.PI/180,vegOut0:150*Math.PI/180,vegOut1:195*Math.PI/180,vegCLo:.02,vegCHi:.04,vegGreen:.8,cK:.24,cMax:.12,hiLo:.55,hiHi:.85,hiDrop:.3,neutralLLo:.35,neutralLHi:.6,neutralCLo:.015,neutralCHi:.05,neutralK:.8,warmHue:62*Math.PI/180,warmIn0:30*Math.PI/180,warmIn1:50*Math.PI/180,warmOut0:82*Math.PI/180,warmOut1:105*Math.PI/180,warmCLo:.015,warmCHi:.045,warmLLo:.2,warmLHi:.4,warmPull:.5,warmGain:.35,warmCMax:.15,shadowK:.1,shadowHi:.4,farLo:50*Math.PI/180,farHi:80*Math.PI/180,farMin0:105*Math.PI/180,farMin1:140*Math.PI/180,farCLo:.02,farCHi:.05,farBoost:.43},St={hue:355*Math.PI/180,bandIn:30*Math.PI/180,bandOut:55*Math.PI/180,lLo:.86,lHi:.96,cLo:.04,cHi:.08,mix:.85},Ct={calmLo:.15,calmHi:.6,veilLLo:.27,veilLHi:.38,liftLo:.08,liftHi:.25,veilCLo:.06,veilCHi:.11,rovKeep:.25};function wt(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function Tt(e,t,n){let r=Ct,i=wt(r.veilLLo,r.veilLHi,e),a=wt(r.liftLo,r.liftHi,n)*(1-wt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}function Et(e,t){return Math.min(1,Math.max(0,t.vivid??0))*Ht(e)*Math.min(1,Math.max(0,e.vividGate??1))}const Dt={sunLo:-.15,sunHi:-.3};function Ot(e,t,n){let r=Ct,i=Math.max(wt(r.veilLLo,r.veilLHi,e),wt(-Dt.sunLo,-Dt.sunHi,-n)),a=wt(r.liftLo,r.liftHi,n)*(1-wt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}const kt={lo:.1,hi:.45},At={min:.6,max:2,chroma:1},jt={k:.85,cLo:.02,cHi:.05};function Mt(e,t){let n=Math.max(0,e);return t!==1&&n>0?n**(1+(t-1)*wt(kt.lo,kt.hi,n)):n}function Nt(e,t,n){return n<1&&e>1e-6?(t/e)**+At.chroma:1}const Pt={amount:.7,calmLo:.05,calmHi:.3},Ft={gain:.5,top:.15,warmGain:.5,warmTop:.12,warmIn0:10*Math.PI/180,warmIn1:45*Math.PI/180,warmOut0:80*Math.PI/180,warmOut1:115*Math.PI/180,magIn0:285*Math.PI/180,magIn1:320*Math.PI/180,magOut0:330*Math.PI/180,magOut1:360*Math.PI/180,cLo:.01,cHi:.07,lLo:.1,lHi:.3,hiLo:.85,hiHi:.97,coolCut:.6,coolIn0:165*Math.PI/180,coolIn1:215*Math.PI/180},It={max:4,wbMin:.25,wbMax:5,waterPow:.6,waterMax:3};function Lt(e){let t=e.wbTap;if(!t||!(t[0]>0)||!(t[1]>0)||!Number.isFinite(t[0])||!Number.isFinite(t[1]))return null;let n=e=>Math.min(It.max,Math.max(1/It.max,e)),r=n(t[0]),i=n(t[1]);return r===1&&i===1?null:[r,i]}function Rt(e,t){let n=Lt(t);if(!n)return e;let r=[n[0],1,n[1]],i=e.wb.map((e,t)=>t===1?e:Math.min(It.wbMax,Math.max(It.wbMin,e*r[t]))),a=e.waterWb.map((e,t)=>t===1?e:Math.min(It.waterMax,Math.max(1/It.waterMax,e*r[t]**+It.waterPow)));return{...e,wb:i,waterWb:a}}const zt={teal:35*Math.PI/180,blue:14*Math.PI/180};function Bt(e){let t=Math.min(1,Math.max(-1,e.waterHue??0));return Number.isFinite(t)?t*(t<0?zt.teal:zt.blue):0}function Vt(e,t){let n=e=>Math.min(1,Math.max(0,e)),r=n(Math.max(e.calm??0,e.calmTone??0));return Math.max(n(t.blue??0),Pt.amount*n(t.vivid??0))*Ht(e)*(1-wt(Pt.calmLo,Pt.calmHi,r))*n(e.blueGate??e.vividGate??1)}function Ht(e){let t=Math.min(1,Math.max(0,Math.max(e.calm??0,e.calmTone??0)));return 1-wt(Ct.calmLo,Ct.calmHi,t)}function Ut(e){return Math.min(1,Math.max(0,e.intensity-1))}function Wt(e){let t=Ut(e);return{strength:Math.min(1,Math.max(0,e.intensity)),saturation:e.saturation+.35*t,clarity:Math.min(1,e.clarity+.5*t),veil:e.veil+.3*t,look:Math.min(1,Math.max(0,e.look)),dehaze:.6*t,hazeLift:0,subjectPop:!!e.subjectPop,subjectPopStrength:e.subjectPopStrength,subjectPopWarmth:e.subjectPopWarmth}}function Gt(e){let t=Math.min(1,Math.max(0,(e.haze-K.deepLo)/(K.deepHi-K.deepLo)));return t*t*(3-2*t)}function Kt(e){return qt(e.haze)}function qt(e){let t=Math.min(1,Math.max(0,(e-K.hazeLo)/(K.hazeHi-K.hazeLo)));return t*t*(3-2*t)}function Jt(e,t){let n=at[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=[Math.min(n.redMax,Math.max(1,e.wb[0]*n.red)),1,Math.min(1.6,Math.max(.5,e.wb[2]*n.blue))],i=[Math.min(2,r[0]**.6),1,Math.min(2,Math.max(.5,r[2]**.6))];return{...e,wb:r,waterWb:i,exposure:e.exposure*n.exposure}}function Yt(e,t){let n=at[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=t.preset===`reef`?Math.min(e.dehaze,.15):Math.min(1,Math.max(e.dehaze,n.dehaze));return{...e,dehaze:r,clarity:Math.min(1,Math.max(0,e.clarity+n.clarity)),hazeLift:Math.max(e.hazeLift,n.hazeLift)}}function Xt(e,t){let n=Math.min(1,Math.max(0,t.look));if(n<=0)return e;let r=Kt(e)*n,i=t.hazeAuto===!1?0:Zt.lift*Kt(e)*e.hazeBlack,a=K.liftRelief*Math.min(1,i/K.liftRef);return{...e,exposure:e.exposure*(1-K.dim*r*(1-a)),levelsMix:Math.min(.85,e.levelsMix+K.hazeLevels*r)}}const Zt={dehaze:.4,clarity:0,levels:.15,lift:.8};function Qt(e,t){let n=Kt(t);return n<=0?e:{...e,dehaze:Math.max(e.dehaze,Zt.dehaze*n),clarity:Math.min(1,e.clarity+Zt.clarity*n),hazeLift:Math.max(e.hazeLift,Zt.lift*n)}}function $t(e){let t=Kt(e);return t<=0?e:{...e,levelsMix:Math.min(.85,e.levelsMix+Zt.levels*t)}}function en(e,t){let n=e.look;if(n<=0)return e;let r=Kt(t)*n;return{...e,dehaze:Math.max(e.dehaze,K.hazeDehaze*r),clarity:Math.min(1,e.clarity+K.hazeClarity*r)}}function tn(e,t){if(t<=0)return e;let n=1+.8*t,r=e.wb.map(e=>Math.min(5,Math.max(.25,e**+n))),i=1.6+1.4*t,a=.6+.3*t,o=r.map(e=>Math.min(i,Math.max(1/i,e**+a)));return{...e,wb:r,waterWb:o,attn:e.attn.map(e=>e*n),gainCap:e.gainCap+t,levelsMix:Math.min(.85,e.levelsMix+.3*t),chromaK:e.chromaK+t}}const q={hue:45*Math.PI/180,bandHue:65*Math.PI/180,bandIn:50*Math.PI/180,bandOut:75*Math.PI/180,achroma:.012,lLo:.4,lHi:.55,cLo:.07,cHi:.1,mix:1,wLo:.1,wHi:.5,cMin:.05};function nn(e){return new Float32Array(e.fields)}function rn(e,t){for(let n=0;n<t.length;n++)e[n*4+1]=t[n];return e}function an(e){let t=new Float32Array(e.width*e.height*4);for(let n=0;n<e.width*e.height;n++)t[n*4]=e.guide[n*3],t[n*4+1]=e.guide[n*3+1],t[n*4+2]=e.guide[n*3+2],t[n*4+3]=e.person?e.person[n]:0;return t}function on(e){let t=e.tilesX*e.tilesY*e.bins,n=new Float32Array(t*4);for(let r=0;r<t;r++)n[r*4]=e.data[r];return n}const sn=1.1,cn=.12,ln=.3,un=2.2,dn=.1,fn=.4,pn=10*Math.PI/180,mn=26*Math.PI/180,J=.025,hn=60*Math.PI/180,gn=110*Math.PI/180,_n=30*Math.PI/180,vn=60*Math.PI/180,yn=.8,bn=1.6,xn=3.5,Sn=.55,Cn=1.5,wn={strength:1,bMin:.8,objLo:0,objHi:0},Tn=.14,En=.86,Dn=.5,On={target:.4,strength:.3,max:1.5,keepLo:.95,keepHi:.95,keepL0:.45,keepL1:.7,min:.6},kn={clip:2,sigLo:.03,sigHi:.1,anchor:1},An=.75,jn=.05,Mn={covLo:.3,covHi:.7,clearLo:.7,clearHi:.85,sig:.8,lift:.7},Nn=.55,Pn=.5,Fn=.12,In={low:.75,mid:.5},Ln=new Map;function Y(e,t){let n=Ln.get(e);return(!n||n.length!==t)&&(n=new Float32Array(t),Ln.set(e,n)),n}const Rn=4096,zn=new Float32Array(Rn+1);for(let e=0;e<=Rn;e++)zn[e]=ne(e/Rn);function Bn(e){if(e<=0)return 0;if(e>=1)return 1;let t=e*Rn,n=t|0,r=t-n;return zn[n]+(zn[n+1]-zn[n])*r}function Vn(e,t,r,i={}){let a=t*r,o=Y(`lin`,a*3),s=Y(`d`,a),l=0,u=0,d=0;for(let t=0;t<a;t++){let n=e[t*4],r=e[t*4+1],i=e[t*4+2];o[t*3]=re[n],o[t*3+1]=re[r],o[t*3+2]=re[i];let a=n/255,c=r/255,f=i/255;s[t]=it.mu0+it.mu1*Math.max(c,f)+it.mu2*a,l+=a,u+=c,d+=f}let f=[l/a,u/a,d/a],p=or(or(s,t,r,2,Y(`blurA`,a),Y(`blurT`,a)),t,r,2,Y(`blurB`,a),Y(`blurT`,a)),[h,g]=ir(p,[.02,.98]),v=Math.max(.02,g-h),y=Y(`z`,a);for(let e=0;e<a;e++)y[e]=Jn((p[e]-h)/v);let b=[],S=[[],[],[]],ee=Y(`lum`,a),te=new Uint8Array(a),ne=new Uint32Array(10),ie=new Uint32Array(1280);for(let e=0;e<a;e++){ee[e]=qn(o,e);let t=Math.min(9,y[e]*10|0);te[e]=t,ne[t]++,ie[t*128+Math.min(127,Math.sqrt(ee[e])*128|0)]++}let C=new Float32Array(10);for(let e=0;e<10;e++){if(ne[e]<24){C[e]=-1;continue}let t=Math.max(6,Math.round(ne[e]*.015)),n=0,r=0;for(;r<128&&(n+=ie[e*128+r],!(n>=t));r++);let i=(r+1)/128;C[e]=i*i}for(let e=0;e<a;e++){let t=C[te[e]];t<0||ee[e]>t||(b.push(y[e]),S[0].push(o[e*3]),S[1].push(o[e*3+1]),S[2].push(o[e*3+2]))}let T=[0,0,0];{let[e]=ir(y,[.98]),t=0;for(let n=0;n<a;n++)y[n]<e||(T[0]+=o[n*3],T[1]+=o[n*3+1],T[2]+=o[n*3+2],t++);t>0?(T[0]/=t,T[1]/=t,T[2]/=t):(T[0]=f[0],T[1]=f[1],T[2]=f[2])}let[,ae,E]=w(T[0],T[1],T[2]),oe=Math.hypot(ae,E)||1,se=[ae/oe,E/oe],D=[0,0,0],ce=[0,0,0],O=[0,0,0];{let e=rr(b,S);for(let t=0;t<3;t++)D[t]=e[t].A,ce[t]=e[t].beta,O[t]=e[t].c}let le=[D[0],D[1],D[2]],ue=0;for(let e=0;e<a;e++)ue+=y[e];let k=ue/a,de=Y(`hueObj`,a),fe=Y(`hueFar`,a),pe=Y(`chroma`,a),me=Y(`veilCos`,a),A=Y(`okL`,a),j=Y(`okA`,a),_e=Y(`okB`,a),ve=Y(`bdWater`,a);for(let e=0;e<a;e++){let[t,n,r]=w(o[e*3],o[e*3+1],o[e*3+2]);A[e]=t,j[e]=n,_e[e]=r,ve[e]=1-Zn(n,r,se,_n,vn,J);let i=Math.hypot(n,r);pe[e]=i,me[e]=i>1e-6?(n*se[0]+r*se[1])/i:1,de[e]=Xn(n,r,se,pn,mn,J),fe[e]=Zn(n,r,se,hn,gn,J)}let M=Y(`bf`,a*3);for(let e=0;e<a;e++){let t=y[e];M[e*3]=D[0]*(1-Math.exp(-(ce[0]*t+O[0]))),M[e*3+1]=D[1]*(1-Math.exp(-(ce[1]*t+O[1]))),M[e*3+2]=D[2]*(1-Math.exp(-(ce[2]*t+O[2])))}let ye=Y(`backdrop`,a),P=new Float32Array(18),Se=Y(`bdDev`,a),Ce=Qn(c.blueLo,c.blueHi,T[2]/Math.max(1e-4,T[1])),we=Ce>0?m(A,j,_e,ve,t,r,ye,P,Se)*Ce:0;if(Ce<=0)ye.fill(0,0,a);else if(Ce<1)for(let e=0;e<a;e++)ye[e]*=Ce;let Te=Y(`objHue`,a);for(let e=0;e<a;e++)Te[e]=Math.max(de[e]*(1-we*(1-Se[e])),ye[e]);let Ee=Yn(o,Te,M,t,r,Y(`veilScale`,a)),De=be(D,T)*N.greenObj,Oe=N.litSub*xe(D,T),ke=.2+Oe,Ae=.55+Oe,je=Y(`J`,a*3),Me=Y(`conf`,a),Ne=Y(`wbWeight`,a),Pe=Y(`sigArr`,a),Fe=()=>{for(let e=0;e<a;e++){let t=Math.max(1e-5,ee[e]),n=Math.min(1,Ee[e]),r=0,i=0,a=[0,0,0];for(let t=0;t<3;t++){let o=M[e*3+t];a[t]=n*o;let s=t===0?.2126:t===1?.7152:.0722;r+=Ee[e]*o*s,i+=a[t]*s}let s=Math.max(0,(t-r)/t);Pe[e]=s;let c=Qn(ke,Ae,s)*(1-fe[e]),l=Math.max(jn,1-i/t);for(let t=0;t<3;t++){let n=o[e*3+t],r=Math.max(n-a[t],n*jn);je[e*3+t]=n*l+(r-n*l)*c}let u=Qn(dn,fn,s),d=Qn(st.lo,st.hi,s)*(1-we+ye[e]);Me[e]=Math.min(u,Math.max(Te[e],d,De)),Ne[e]=Math.sqrt(u)}};Fe();let Ie=0;{let e=0;for(let t=0;t<a;t++)e+=Me[t];let[n,i]=ir(Pe,[.5,.95]),s=Qn(Mn.covLo,Mn.covHi,e/a)*(1-Qn(Mn.clearLo,Mn.clearHi,i));Ie=s;let c=1+(Math.min(1,(1-Mn.sig)/Math.max(.001,1-n))-1)*s;if(c<.98){for(let e=0;e<3;e++)D[e]*=c;for(let e=0;e<a*3;e++)M[e]*=c;Ee=Yn(o,Te,M,t,r,Ee),Fe()}}let Le=0,Re=0,ze=0,Be=0;for(let e=0;e<a;e++){let t=Ne[e];if(t<=0)continue;let n=je[e*3],r=je[e*3+1],i=je[e*3+2],a=n*n,o=r*r,s=i*i;Le+=t*a*a*a,Re+=t*o*o*o,ze+=t*s*s*s,Be+=t}let Ve=[1,1,1],He=be(D,T);if(Be>0){let e=(Le/Be)**(1/6)+1e-5,t=(Re/Be)**(1/6)+1e-5,n=(ze/Be)**(1/6)+1e-5;Ve[0]=Math.min(xn+(N.greenRMax-xn)*He,Math.max(1,t/e));let r=Math.min(Cn+(N.greenBMax-Cn)*He,Math.max(1,D[1]/Math.max(1e-4,D[2])));Ve[2]=Math.min(r,Math.max(Sn,t/n))}let Ue=Qn(.01,.06,Be/a);Ve[0]=1+(Ve[0]-1)*Ue,Ve[2]=1+(Ve[2]-1)*Ue;let F=(e,t)=>{let n=Math.min(1.15,Math.max(0,y[e]+Math.min(.25,Math.max(-.25,Pn*(s[e]-p[e])/v)))),r=Math.max(1e-5,ee[e]),i=0,a=0,c=[0,0,0];for(let t=0;t<3;t++){let r=ot.veil*D[t]*(1-Math.exp(-(ce[t]*n+O[t]))),o=t===0?.2126:t===1?.7152:.0722;c[t]=Math.min(1,Ee[e])*r,i+=Ee[e]*r*o,a+=c[t]*o}let l=Qn(ke,Ae,Math.max(0,(r-i)/r))*(1-fe[e]),u=Math.max(jn,1-a/r);for(let n=0;n<3;n++){let r=o[e*3+n],i=Math.max(r-c[n],r*jn);t[n]=r*u+(i-r*u)*l}return n};He>0&&(Ve[0]*=1+(N.greenWarmR-1)*He,Ve[2]*=1+(N.greenWarmB-1)*He);let We=new Uint8Array(a),Ge=Kn(F,Me,de,pe,me,ee,t,r,We);if(Ge.weight>0){let e=D[1]/Math.max(1e-4,D[2]),t=e>1?Math.min(Gn,e*e):1,n=1/Math.max(.5,1+sn*Qn(cn,ln,g-h)*(Ge.z-k)),r=Math.min(xn,Math.max(1,(Ge.mean[1]/Math.max(1e-5,Ge.mean[0]))**+n)),i=Math.min(t,Math.max(Sn,(Wn*Ge.mean[1]/Math.max(1e-5,Ge.mean[2]))**+n)),a=(e,t)=>Math.exp(Math.log(e)+(Math.log(t)-Math.log(e))*Ge.weight);Ve[0]=a(Ve[0],r),Ve[2]=a(Ve[2],i)}for(let e=0;e<6&&!(er(je,Ne,a,Ve)<=.015);e++)Ve[0]=Math.max(1,Ve[0]*.9);{let e=0;for(let t=0;t<a;t++)e+=Me[t];let t=wn.strength*(wn.objHi>0?Qn(wn.objLo,wn.objHi,e/a):1);Ve[0]**=+t,Ve[2]=Math.max(Math.min(1,wn.bMin),Ve[2]**+t)}let Ke=Qn(cn,ln,g-h),qe=[sn*Ke*Math.log(Ve[0]),0,sn*Ke*Math.log(Ve[2])];for(let e=0;e<a;e++){let t=y[e]-k;for(let n=0;n<3;n++)je[e*3+n]*=Math.min(un,Math.max(1/un,Math.exp(qe[n]*t)))}let Je=e=>Math.min(bn,Math.max(1/bn,e**.6)),I=[Je(Ve[0]),1,Je(Ve[2])];if(I[2]<1&&(I[2]+=(1-I[2])*we*Qn(1,1.25,D[2]/Math.max(1e-4,D[1]))),He>0)for(let e of[0,2])I[e]=Math.exp(Math.log(I[e])+(Math.log(Ve[e])-Math.log(I[e]))*He*N.greenWater);let Ye=Y(`waterLin`,a*3);for(let e=0;e<a;e++){Me[e];for(let t=0;t<3;t++)je[e*3+t]=je[e*3+t]*Ve[t],Ye[e*3+t]=o[e*3+t]*I[t]}let Xe=Y(`Y`,a),Ze=(e,t,n)=>{let r=Me[e],i=e*3,a=Ye[i]*n,o=Ye[i+1]*n,s=Ye[i+2]*n,c=(a+(je[i]*t-a)*r)*.2126;return c+=(o+(je[i+1]*t-o)*r)*.7152,c+=(s+(je[i+2]*t-s)*r)*.0722,c=Math.max(c,$n(ee[e])*ee[e]*n),c>An?An+(1-An)*(1-Math.exp(-(c-An)/(1-An))):c},Qe=0,$e=0,et=0;for(let e=0;e<a;e++){let t=Ze(e,1,1);Qe+=Me[e]*Math.log(1e-4+t),$e+=Me[e],et+=Me[e]}let L=Qn(.02,.15,et/a),tt=$e>1e-6?Math.exp(Qe/$e):Tn,R=Math.min(1.35,Math.max(.75,Tn/Math.max(1e-4,tt)));R=1+(R-1)*L;{let e=R**+yn;for(let t=0;t<a;t++)Xe[t]=Ze(t,R,e)}let[z]=ir(Xe,[.995]);if(z>En){R=Math.max(.6,En/z*R);let e=R**+yn;for(let t=0;t<a;t++)Xe[t]=Ze(t,R,e)}let[nt,rt,at]=ir(Xe,[.004,.1,.5]),ct=Math.min(nt,In.low*rt,In.mid*at)*(1-Mn.lift*Ie),lt=[0,0,0];{let e=R**+yn,t=Y(`hazeCh`,a);for(let n=0;n<3;n++){for(let r=0;r<a;r++){let i=Ye[r*3+n]*e;t[r]=i+(je[r*3+n]*R-i)*Me[r]}lt[n]=ir(t,[.004])[0]}}if(ct<nt)for(let e=0;e<3;e++)lt[e]*=ct/nt;{let e=Zt.lift*qt(Jn(nt/Fn))*ct;if(e>0)for(let t=0;t<a;t++)Xe[t]*=ft(Xe[t],e)}let[ut,dt]=ir(Xe,[.004,.996]),pt=Math.min(ut,.015),mt=Math.min(1,Math.max(dt,pt+.2,.65)),ht=Y(`enc`,a);for(let e=0;e<a;e++){let t=Xe[e];ht[e]=Bn(Jn(t+((t-pt)/(mt-pt)-t)*Dn))}let V=dr(ht,t,r),H=1;if(On.strength>0){let e=Math.cbrt(Math.max(1e-4,re[Math.round(255*Jn(ir(ht,[.5])[0]))]));e>On.target&&e<.98&&(H=1+(Math.min(On.max,Math.log(On.target)/Math.log(e))-1)*On.strength)}{let e=Math.cbrt(Math.max(1e-4,re[Math.round(255*Jn(ir(ht,[.5])[0]))])),t=Math.cbrt(Math.max(1e-4,ir(ee,[.5])[0])),n=t*(On.keepLo+(On.keepHi-On.keepLo)*Qn(On.keepL0,On.keepL1,t));On.keepLo>0&&e>.02&&e<.98&&e**+H<n&&(H=Math.max(On.min,Math.log(n)/Math.log(e)))}let U=Me,W=0,gt,_t,vt;if(we>0){let e=Y(`subjMap`,a),s=Y(`notAnimal`,a);s.fill(0,0,a);let c=Y(`subjSmall`,a);W=x(ye,Se,we,t,r,e,A,P,ve,i.seeds,j,_e,s,_t=[],c),U=Y(`confMap`,a);for(let t=0;t<a;t++)U[t]=Me[t]+(e[t]-Me[t])*we;let l=e;for(let t=0;t<a;t++)if(c[t]>e[t]){l=Y(`subjAll`,a);break}if(l!==e){vt=Y(`confPop`,a);let n=e=>1-Qn(G.rLo,G.rHi,o[e*3]/Math.max(1e-4,o[e*3+1],o[e*3+2]))*(P?Qn(0,.04,A[e]-_((e%t+.5)/t,(Math.floor(e/t)+.5)/r,P)):1);for(let i=0;i<a;i++){let a=1;if(c[i]>e[i]){let e=i%t,o=(i-e)/t;for(let i=-1;i<=1;i++)for(let s=-1;s<=1;s++){let c=e+s,l=o+i;c>=0&&l>=0&&c<t&&l<r&&(a=Math.min(a,n(l*t+c)))}a=Qn(.5,1,a)}l[i]=Math.max(e[i],c[i]*a*lr),vt[i]=Me[i]+(l[i]-Me[i])*we}}gt=n(l,Se,t,r,160,90,s)}let yt=cr(y,U,p,Ee,o,t,r);vt&&(yt.popConf=ur(vt,t,r)),gt&&(yt.animals=gt),_t&&(yt.blobs=_t);let K=Jn(nt/Fn),bt=he(o,a),{calm:xt,calmTone:St}=ge(bt,K),Ct=0,wt=0,Et=0,Dt=0;for(let e=0;e<r;e++){let n=e<r/3?1:e>=2*r/3?2:0;if(n)for(let r=0;r<t;r++){let i=A[e*t+r];i<.02||(n===1?(Ct+=i,wt++):(Et+=i,Dt++))}}let kt=w(le[0],le[1],le[2]),At=wt>0&&Dt>0?Et/Dt-Ct/wt:0,jt=Tt(kt[0],Math.hypot(kt[1],kt[2]),At),Mt=Ot(kt[0],Math.hypot(kt[1],kt[2]),At),Nt=0,Pt=1,Ft=0;{let e=Float32Array.from(A).sort();Nt=e[Math.floor(.25*(a-1))],Pt=e[Math.floor(.97*(a-1))];let t=e[Math.floor(.8*(a-1))],n=0,r=0;for(let e=0;e<a;e++)A[e]>=t&&(n+=o[e*3],r+=o[e*3+1]);Ft=1-Qn(B.redLo,B.redHi,n/Math.max(1e-5,r));let i=wt>0&&Dt>0?Et/Dt-Ct/wt:0;Ft*=Qn(B.bandLo,B.bandHi,i)}let It=ar(A,t,r,Nt,Pt);return{params:{toneGamma:H,seabedNeed:Ft,seabedLw:Nt,seabedLb:Pt,seabedGrid:It,binf:D,betaB:ce,cB:O,attn:qe,gainCap:un,zMean:k,wb:Ve,waterWb:I,confLo:dn,confHi:fn,veilColor:T,cosLo:pn,cosHi:mn,hueFarLo:hn,hueFarHi:gn,haze:K,hazeBlack:ct,frameBlack:ct,hazeFloor:lt,achroma:J,waterExposure:yn,exposure:R,black:pt,white:mt,levelsMix:Dn,chromaK:2.6,chromaC0:.025,zLo:h,zHi:g,depthGuide:Pn,floorFrac:jn,shadowFloor:Nn,knee:An,subLo:ke,subHi:Ae,calm:xt,calmTone:St,backdrop:we,backdropFit:Array.from(P),subjectTone:W,vividGate:jt,blueGate:Mt},depth:yt,clahe:V,mean:f,diag:{sandWeight:Ge.weight,sandFrac:Ge.frac,sandMask:We,calm:bt,backdrop:we,tone:{black:nt,yLow:rt,yMid:at,veilCap:Ie}}}}const Hn=75*Math.PI/180,Un=Math.cos(Hn),Wn=.94,Gn=1.8;function Kn(e,t,n,r,i,a,o,s,c){let l=o*s,u=Y(`sandSq`,l);for(let e=0;e<l;e++)u[e]=a[e]*a[e];let d=or(a,o,s,2,Y(`sandM`,l),Y(`blurT`,l)),f=or(u,o,s,2,Y(`sandS`,l),Y(`blurT`,l)),p=Y(`sandCand`,l),m=0;for(let e=0;e<l;e++){if(p[e]=-1,t[e]<.5||n[e]<.3||a[e]<.12)continue;let o=Math.sqrt(Math.max(0,f[e]-d[e]*d[e]));if(o>.22*d[e]||o<.045*d[e])continue;let s=r[e];s>.13||s>.03&&i[e]<Un||(p[e]=a[e],m++)}let h=m/l,g=.95*Qn(.05,.15,h),_=[0,0,0];if(g<=0)return{weight:0,frac:h,mean:_,z:0};let[v]=ir(p,[1-.30000000000000004*h]),y=0,b=[0,0,0],x=0;for(let t=0;t<l;t++)p[t]<v||(x+=e(t,b),_[0]+=b[0],_[1]+=b[1],_[2]+=b[2],y++);if(y===0)return{weight:0,frac:h,mean:_,z:0};_[0]/=y,_[1]/=y,_[2]/=y;for(let e=0;e<l;e++)c[e]=+(p[e]>=v);return{weight:g,frac:h,mean:_,z:x/y}}function qn(e,t){return ie(e[t*3],e[t*3+1],e[t*3+2])}function Jn(e){return e<0?0:e>1?1:e}function Yn(e,t,n,r,i,a){let o=Array.from({length:144},()=>[]);for(let a=0;a<i;a++){let s=Math.min(8,Math.floor(a*9/i));for(let i=0;i<r;i++){let c=a*r+i;if(t[c]>.5)continue;let l=n[c*3]*.2126;if(l+=n[c*3+1]*.7152,l+=n[c*3+2]*.0722,l<.001)continue;let u=ie(e[c*3],e[c*3+1],e[c*3+2]),d=Math.min(15,Math.floor(i*16/r));o[s*16+d].push(u/l)}}let s=new Float32Array(144).fill(NaN);for(let e=0;e<144;e++){let t=o[e];t.length<6||(t.sort((e,t)=>e-t),s[e]=Math.min(2.2,Math.max(.6,t[t.length>>1])))}for(let e=0;e<8;e++){let e=!1,t=new Float32Array(s);for(let n=0;n<9;n++)for(let r=0;r<16;r++){let i=n*16+r;if(!Number.isNaN(s[i]))continue;let a=0,o=0;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++){let i=r+t,c=n+e;if(i<0||c<0||i>=16||c>=9)continue;let l=s[c*16+i];Number.isNaN(l)||(a+=l,o++)}o>0&&(t[i]=a/o,e=!0)}if(s.set(t),!e)break}for(let e=0;e<144;e++)Number.isNaN(s[e])&&(s[e]=1);for(let e=0;e<i;e++){let t=Math.min(Math.max((e+.5)*9/i-.5,0),8),n=Math.floor(t),o=Math.min(n+1,8),c=t-n;for(let t=0;t<r;t++){let i=Math.min(Math.max((t+.5)*16/r-.5,0),15),l=Math.floor(i),u=Math.min(l+1,15),d=i-l,f=s[n*16+l]*(1-d)+s[n*16+u]*d,p=s[o*16+l]*(1-d)+s[o*16+u]*d;a[e*r+t]=f*(1-c)+p*c}}return a}function Xn(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 1;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o)),c=Qn(r,i,Math.acos(s)),l=Qn(a,a*2,o);return c+(1-c)*(1-l)}function Zn(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 0;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o));return Qn(r,i,Math.acos(s))*Qn(a,a*2,o)}function Qn(e,t,n){let r=Jn((n-e)/(t-e));return r*r*(3-2*r)}function $n(e,t=Nn){return .97+(t-.97)*Qn(.02,.15,e)}function er(e,t,n,r){let i=0,a=0;for(let o=0;o<n;o+=2){if(t[o]<.5)continue;let[n,s,c]=w(e[o*3]*r[0],e[o*3+1]*r[1],e[o*3+2]*r[2]);if(n<.25||n>.9||Math.hypot(s,c)<.06)continue;i++;let l=ae(s,c);l>300&&l<348&&a++}return i<20?0:a/i}const tr=[.3,.45,.65,.9,1.3,1.8,2.5,3.5,5,7],nr=[0,.1,.2,.35,.5,.7,1,1.5];function rr(e,t){let n=[{A:0,beta:1,c:0},{A:0,beta:1,c:0},{A:0,beta:1,c:0}];if(e.length<12)return n;let r=Math.max(1,Math.ceil(e.length/400)),i=[],a=[[],[],[]];for(let n=0;n<e.length;n+=r){i.push(e[n]);for(let e=0;e<3;e++)a[e].push(t[e][n])}let o=i.length,s=new Float32Array(o),c=[{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0}];for(let e of tr)for(let t of nr){let n=0;for(let r=0;r<o;r++){let a=1-Math.exp(-(e*i[r]+t));s[r]=a,n+=a*a}let r=1+.05*t;for(let i=0;i<3;i++){let l=a[i],u=0,d=0;for(let e=0;e<o;e++)u+=s[e]*l[e],d+=l[e]*l[e];let f=n>1e-9?Math.min(1,Math.max(0,u/n)):0,p=(f*f*n-2*f*u+d)*r;p<c[i].err&&(c[i]={A:f,beta:e,c:t,err:p})}}let l=(e,t)=>e.A*(1-Math.exp(-(e.beta*t+e.c))),u=1;for(let e of[.1,.3,.6,1]){let t=l(c[0],e),n=.85*Math.min(l(c[1],e),l(c[2],e));t>n&&(u=Math.min(u,t>1e-6?n/t:0))}return c[0].A*=Math.max(0,u),c.map(e=>({A:e.A,beta:e.beta,c:e.c}))}function ir(e,t){let n=1/0,r=-1/0;for(let t=0;t<e.length;t++){let i=e[t];i<n&&(n=i),i>r&&(r=i)}if(!(r>n))return t.map(()=>n);let i=2048,a=new Uint32Array(i),o=(i-1)/(r-n);for(let t=0;t<e.length;t++)a[(e[t]-n)*o|0]++;let s=[];for(let r of t){let t=r*e.length,c=0,l=0;for(;l<i&&(c+=a[l],!(c>=t));l++);s.push(n+Math.min(l,i-1)/o)}return s}function ar(e,t,n,r,i){let a=B.grid,o=Array(a*a).fill(0),s=Array(a*a).fill(0),c=Math.max(i,r+.05),l=r+B.lo*(c-r),u=r+(B.lo+B.span)*(c-r);for(let r=0;r<n;r++){let i=Math.min(a-1,Math.floor(r*a/n));for(let n=0;n<t;n++){let c=i*a+Math.min(a-1,Math.floor(n*a/t));o[c]+=Qn(l,u,e[r*t+n]),s[c]++}}return o.map((e,t)=>s[t]>0?e/s[t]:0)}function or(e,t,n,r,i=new Float32Array(t*n),a=new Float32Array(t*n)){let o=2*r+1;for(let i=0;i<n;i++){let n=0;for(let a=-r;a<=r;a++)n+=e[i*t+sr(a,t)];for(let s=0;s<t;s++)a[i*t+s]=n/o,n+=e[i*t+sr(s+r+1,t)]-e[i*t+sr(s-r,t)]}for(let e=0;e<t;e++){let s=0;for(let i=-r;i<=r;i++)s+=a[sr(i,n)*t+e];for(let c=0;c<n;c++)i[c*t+e]=s/o,s+=a[sr(c+r+1,n)*t+e]-a[sr(c-r,n)*t+e]}return i}function sr(e,t){return e<0?0:e>=t?t-1:e}function cr(e,t,n,r,i,a,o){let s=or(e,a,o,1),c=or(or(t,a,o,1),a,o,1),l=new Float32Array(14400*4),u=new Float32Array(14400*3);for(let e=0;e<90;e++){let t=Math.floor(e*o/90),d=Math.max(t+1,Math.floor((e+1)*o/90));for(let o=0;o<160;o++){let f=Math.floor(o*a/160),p=Math.max(f+1,Math.floor((o+1)*a/160)),m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;for(let e=t;e<d;e++)for(let t=f;t<p;t++){let o=e*a+t;m+=s[o],h+=c[o],g+=n[o],_+=r[o],v+=i[o*3],y+=i[o*3+1],b+=i[o*3+2],x++}let S=e*160+o;l[S*4]=m/x,l[S*4+1]=h/x,l[S*4+2]=g/x,l[S*4+3]=_/x,u[S*3]=v/x,u[S*3+1]=y/x,u[S*3+2]=b/x}}return{width:160,height:90,fields:l,guide:u}}const lr=.85;function ur(e,t,n){let r=or(or(e,t,n,1),t,n,1),i=new Float32Array(14400);for(let e=0;e<90;e++){let a=Math.floor(e*n/90),o=Math.max(a+1,Math.floor((e+1)*n/90));for(let n=0;n<160;n++){let s=Math.floor(n*t/160),c=Math.max(s+1,Math.floor((n+1)*t/160)),l=0,u=0;for(let e=a;e<o;e++)for(let n=s;n<c;n++)l+=r[e*t+n],u++;i[e*160+n]=l/u}}return i}function dr(e,t,n){let r=new Float32Array(1536),i=new Float32Array(32);for(let a=0;a<6;a++){let o=Math.floor(a*n/6),s=Math.floor((a+1)*n/6);for(let n=0;n<8;n++){let c=Math.floor(n*t/8),l=Math.floor((n+1)*t/8);i.fill(0);let u=0,d=0,f=0;for(let n=o;n<s;n++)for(let r=c;r<l;r++){let a=e[n*t+r];i[Math.min(31,a*32|0)]++,d+=a,f+=a*a,u++}let p=.5;for(let e=0,t=0;e<32;e++){if(t+i[e]>=u/2&&i[e]>0){p=(e+(u/2-t)/i[e])/32;break}t+=i[e]}let m=kn.clip*u/32,h=0;for(let e=0;e<32;e++)i[e]>m&&(h+=i[e]-m,i[e]=m);let g=h/32,_=(a*8+n)*32;if(u===0){for(let e=0;e<32;e++)r[_+e]=(e+1)/32;continue}let v=d/u,y=Qn(kn.sigLo,kn.sigHi,Math.sqrt(Math.max(0,f/u-v*v))),b=0,x=p;{let e=Math.min(31,p*32|0),t=0;for(let n=0;n<e;n++)t+=i[n]+g;x=(t+(i[e]+g)*(p*32-e))/u}let S=kn.anchor*(x-p);for(let e=0;e<32;e++){b+=i[e]+g;let t=(e+1)/32;r[_+e]=Jn(t+y*(b/u-t-S))}}}return{tilesX:8,tilesY:6,bins:32,data:r}}const X={popLo:.2,popHi:.6,alphaR:6,rampIn:2.5,trustLo:2,trustHi:4.5,evLo:.025,evHi:.07,evFar:.4,rampEv:1,thinLevels:4,jbuK:.5,jbuNoise:.02,jbuLo:.46,jbuHi:.72};function fr(e,t,n){let r=Math.min(n,...t),i=Math.max(n,...t),a=1/Math.max(X.jbuNoise,X.jbuK*(i-r));return e.map((e,r)=>e*Math.exp(-(((t[r]-n)*a)**2)))}const pr=`
const float CONF_BRIGHT_LO = ${st.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${st.hi.toFixed(4)};
const float PERSON_LUM_LO = ${ct.lo.toFixed(4)};
const float PERSON_LUM_HI = ${ct.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${lt.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${lt.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${ut.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${ut.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${ut.farKeep.toFixed(4)};
const float VIVID_C_LO = ${yt.cLo.toFixed(4)};
const float VIVID_C_HI = ${yt.cHi.toFixed(4)};
const float VIVID_KEEP = ${yt.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${E.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${oe.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${se.toFixed(4)};
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
const float DG_K = ${pt.k.toFixed(4)};
const float DG_EPS = ${pt.eps.toFixed(5)};
const float DG_R_MIN = ${pt.rMin.toFixed(4)};
const float DG_R_MAX = ${pt.rMax.toFixed(4)};
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
const float SC_K = ${ht.k.toFixed(4)};
const float SC_CMAX = ${ht.cMax.toFixed(4)};
const float SC_DESAT = ${ht.desat.toFixed(4)};
const float SC_EDGE = ${ht.edgeFloor.toFixed(4)};
const float SP_VIVID = ${H.vividKeep.toFixed(4)};
const float SP_CLARITY = ${H.clarity.toFixed(4)};
const float SP_LIFT = ${H.lift.toFixed(4)};
const float WP_HUE = ${V.hue.toFixed(4)};
const float SB_HUE = ${B.hue.toFixed(4)};
const float SB_CHROMA = ${B.chroma.toFixed(4)};
const float SB_KEEP = ${B.keep.toFixed(4)};
const float SB_LIFT = ${B.lift.toFixed(4)};
const float SB_GRID = ${B.grid.toFixed(1)};
const float SB_W_LO = ${B.wLo.toFixed(4)};
const float SB_W_HI = ${B.wHi.toFixed(4)};
const float SB_Y0 = ${B.y0.toFixed(4)};
const float SB_Y1 = ${B.y1.toFixed(4)};
const float WP_CMIN = ${V.cMin.toFixed(4)};
const float WP_CMAX = ${V.cMax.toFixed(4)};
const float WP_KEEP = ${V.keep.toFixed(4)};
const float WP_LLO = ${V.lLo.toFixed(4)};
const float WP_LHI = ${V.lHi.toFixed(4)};
const float WP_WLO = ${V.wLo.toFixed(4)};
const float WP_WHI = ${V.wHi.toFixed(4)};
const float WP_SIDE = ${V.side.toFixed(4)};
const float WP_CAST_LO = ${V.castLo.toFixed(4)};
const float WP_CAST_HI = ${V.castHi.toFixed(4)};
const float WP_LIT_LO = ${V.litLo.toFixed(4)};
const float WP_LIT_HI = ${V.litHi.toFixed(4)};
const float WP_UP_LO = ${V.upLo.toFixed(4)};
const float WP_UP_HI = ${V.upHi.toFixed(4)};
const float WP_FLOOR = ${V.floor.toFixed(4)};
const float WP_FLOOR_KEEP = ${V.floorKeep.toFixed(4)};
const float WP_ENGINE_TONE = ${V.engineTone.toFixed(4)};
const float WP_AMOUNT = ${V.amount.toFixed(4)};
const float SP_CHROMA = ${H.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${H.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${H.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${H.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${H.chromaFollowDark.toFixed(4)};
const float SP_WATER_LO = ${H.waterLo.toFixed(4)};
const float SP_WATER_HI = ${H.waterHi.toFixed(4)};
const float SP_DARK_LO = ${H.darkLo.toFixed(4)};
const float SP_DARK_HI = ${H.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(H.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(H.hueMax).toFixed(6)};
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
const float SR_DARK_LO = ${U.darkLo.toFixed(4)};
const float SR_DARK_HI = ${U.darkHi.toFixed(4)};
const float SR_POP_GATE = ${U.popGate.toFixed(4)};
const float SR_SEP = ${U.sep.toFixed(4)};
const float SR_X_SEP = ${U.boostSep.toFixed(4)};
const float SR_SEP_RANGE = ${U.sepRange.toFixed(4)};
const float SR_SEP_CLOSE = ${U.sepClose.toFixed(4)};
const float WG_L_LO = ${gt.lLo.toFixed(4)};
const float WG_L_HI = ${gt.lHi.toFixed(4)};
const float WG_CROSS = ${gt.cross.toFixed(4)};
const float WG_SRC_LO = ${gt.srcLo.toFixed(4)};
const float SR_HEAD = ${U.head.toFixed(4)};
const float SR_VIB = ${U.vib.toFixed(4)};
const float SR_X_VIB = ${U.boostVib.toFixed(4)};
const float SR_VIB_LO = ${U.vibLo.toFixed(4)};
const float SR_VIB_HI = ${U.vibHi.toFixed(4)};
const float SR_RIM_LO = ${U.rimLo.toFixed(4)};
const float SR_RIM_HI = ${U.rimHi.toFixed(4)};
const float SEG_THICK_R = ${U.thick.toFixed(4)};
const float SR_COS = ${Math.cos(U.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(U.hue).toFixed(6)};
const float SR_FAR_KEEP = ${U.farKeep.toFixed(4)};
const float SR_EDGE = ${U.edge.toFixed(4)};
const float SEG_PACK = ${U.pack.toFixed(4)};
const float SEG_LEVELS = ${U.levels.toFixed(4)};
const float SR_HI_LO = ${U.hiLo.toFixed(4)};
const float SR_HI_HI = ${U.hiHi.toFixed(4)};
const float SR_DETAIL = ${U.detail.toFixed(4)};
const float SR_R_MIN = ${U.rMin.toFixed(4)};
const float SR_R_MAX = ${U.rMax.toFixed(4)};
const float SR_X_DETAIL = ${U.boostDetail.toFixed(4)};
const float SD_K = ${W.k.toFixed(4)};
const float SD_RANGE = ${W.range.toFixed(4)};
const float SP_HI_LO = ${H.hiLo.toFixed(4)};
const float SP_HI_HI = ${H.hiHi.toFixed(4)};
const float SD_DETAIL = ${W.detail.toFixed(4)};
const float SD_R_MIN = ${W.rMin.toFixed(4)};
const float SD_R_MAX = ${W.rMax.toFixed(4)};
const float SD_CHROMA = ${W.chroma.toFixed(4)};
const float SD_ENGINE = ${W.engine.toFixed(4)};
const float SD_ENGINE_LO = ${W.engineLo.toFixed(4)};
const float SD_ENGINE_HI = ${W.engineHi.toFixed(4)};
const float SD_TOE_LO = ${W.toeLo.toFixed(4)};
const float SD_TOE_HI = ${W.toeHi.toFixed(4)};
const float SD_W_MAX = ${W.wMax.toFixed(4)};
const float SD_FAR_KEEP = ${W.farKeep.toFixed(4)};
const float SD_FAR_LIT = ${W.farLit.toFixed(4)};
const float SD_SPOT = ${W.spot.toFixed(4)};
const float SD_SPOT_LO = ${W.spotLo.toFixed(4)};
const float SD_SPOT_HI = ${W.spotHi.toFixed(4)};
const float SD_SPOT_L_LO = ${W.spotLLo.toFixed(4)};
const float SD_SPOT_L_HI = ${W.spotLHi.toFixed(4)};
const float SD_BED = ${W.bed.toFixed(4)};
const float SD_FAR_LO = ${W.farLo.toFixed(4)};
const float SD_FAR_HI = ${W.farHi.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(G.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(G.warmHue).toFixed(6)};
const float ON_WARM_LO = ${G.warmLo.toFixed(4)};
const float ON_WARM_HI = ${G.warmHi.toFixed(4)};
${Object.entries(bt).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(xt).map(([e,t])=>`const float BW_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(Ft).map(([e,t])=>`const float RL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(St).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
const float TONE_TOE_LO = ${kt.lo.toFixed(6)};
const float TONE_TOE_HI = ${kt.hi.toFixed(6)};
const float TONE_CHROMA = ${At.chroma.toFixed(6)};
const float WK_K = ${jt.k.toFixed(6)};
const float WK_C_LO = ${jt.cLo.toFixed(6)};
const float WK_C_HI = ${jt.cHi.toFixed(6)};
`,mr=pr.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`);`${pr}${nt()}${Re}`,`${mr}${rt()}${ze}`;const hr=mt.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),gr=mt.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),_r=`
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
${hr}
  return acc / sw;
}`,vr=`
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
${gr}
  return acc.xyz / acc.w;
}`,yr=e=>e.replaceAll(`dgTap`,`dgTapNr`).replaceAll(`detailBase`,`detailBaseNr`).replaceAll(`u_source`,`u_tpNr`);yr(_r),yr(vr);const br=U.thick;function xr(e){let t=Math.floor((e+8)/U.pack),n=Math.floor((t+.5)/(U.levels+1));return[e-U.pack*t,(t-(U.levels+1)*n)/U.levels,n/X.thinLevels]}const Sr=new WeakMap;function Cr(e){if(!e.popConf)return e;let t=Sr.get(e);return t||(t={...e,fields:rn(new Float32Array(e.fields),e.popConf)},Sr.set(e,t)),t}function wr(e){let t=e.settings.subjectPop&&e.depth.popConf?{...e,depth:Cr(e.depth)}:e,n=t.settings.hazeAuto!==!1,r=Rt(Xt((n?$t:e=>e)(Jt(tn(_e(t.params),Ut(t.settings)),t.settings)),t.settings),t.settings),i=Ee(Yt(ve(Wt(t.settings),r),t.settings),r);return{...t,params:r,settings:{...en(n?Qt(i,r):i,r),vivid:Et(r,t.settings),blue:Vt(r,t.settings)},seabed:Tr(r,t.settings),waterTint:Bt(t.settings),fitLook:Ye(r,t.settings),fitLookGate:Xe(r,t.settings),fitLookMix:Ze(t.settings)}}function Tr(e,t){return Z(t.seabed??0,0,1)*Z(e.seabedNeed??0,0,1)*(1-Z(e.backdrop??0,0,1))}function Er(e,t,n){let r=B.grid,i=e.seabedGrid;if(!i||i.length!==r*r)return 0;let a=t*r-.5,o=n*r-.5,s=Math.floor(a+.5),c=Math.floor(o+.5),l=a-s,u=o-c,d=[.5*(.5-l)*(.5-l),.75-l*l,.5*(.5+l)*(.5+l)],f=[.5*(.5-u)*(.5-u),.75-u*u,.5*(.5+u)*(.5+u)],p=0;for(let e=0;e<3;e++)for(let t=0;t<3;t++)p+=d[t]*f[e]*i[Z(c+e-1,0,r-1)*r+Z(s+t-1,0,r-1)];return Q(B.wLo,B.wHi,p)*Q(B.y0,B.y1,n)}const Dr=.12;function Or(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=0,b=0,x=0,S=0,ee=0,te=0,ne=0,re=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of re){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*Dr*Dr)),p=s*4,re=e.person?e.person[s]:0;h+=f*e.fields[p],g+=f*e.fields[p+1],_+=f*e.fields[p+2],v+=f*e.fields[p+3],b+=f*re,y+=f,x+=o*e.fields[p],S+=o*e.fields[p+1],ee+=o*e.fields[p+2],te+=o*e.fields[p+3],ne+=o*re}let ie=Math.min(1,y/.08);return y<1e-6?[x,S,ee,te,0,ne]:[h/y,g/y,_/y,v/y,ie,b/y]}function kr(e,t,n,r){let i=r*e.bins-1,a=t=>{let n=t*e.bins;if(i<0)return e.data[n]*(i+1);let r=Math.min(e.bins-1,Math.floor(i)),a=Math.min(e.bins-1,r+1),o=Math.min(1,Math.max(0,i-r));return e.data[n+r]+(e.data[n+a]-e.data[n+r])*o},o=Math.min(Math.max(t*e.tilesX-.5,0),e.tilesX-1),s=Math.min(Math.max(n*e.tilesY-.5,0),e.tilesY-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.tilesX-1),d=Math.min(l+1,e.tilesY-1),f=o-c,p=s-l,m=a(l*e.tilesX+c)*(1-f)+a(l*e.tilesX+u)*f,h=a(d*e.tilesX+c)*(1-f)+a(d*e.tilesX+u)*f;return m*(1-p)+h*p}function Ar(e,t,n,r,i,a,o,s=0){let{params:l,settings:u}=e,d=o?o[0]:t,f=o?o[1]:n,p=o?o[2]:r,m=te(d),h=te(f),y=te(p),b=it.mu0+it.mu1*Math.max(f,p)+it.mu2*d,[x,S,ee,re,C,T]=Or(e.depth,i,a,m,h,y),ae=Z(T,0,1),E=Math.max(.02,l.zHi-l.zLo),oe=Z((b-l.zLo)/E,0,1.15),se=oe+(Z(x+Z(l.depthGuide*(b-ee)/E,-.25,.25),0,1.15)-oe)*C,D=1+(re-1)*C,ce=[m,h,y],O=Math.max(1e-5,ie(m,h,y)),le=[0,0,0],ue=[0,0,0],k=0,de=0,fe=Math.min(1,D);for(let e=0;e<3;e++){let t=u.veil*l.binf[e]*(1-Math.exp(-(l.betaB[e]*se+l.cB[e])));le[e]=D*t,ue[e]=fe*t;let n=e===0?.2126:e===1?.7152:.0722;k+=le[e]*n,de+=ue[e]*n}let pe=Math.max(0,(O-k)/O),me=w(m,h,y),A=me[1],j=me[2],he=Q(l.subLo,l.subHi,pe)*(1-ii(A,j,l))*(1-N.greenProp*Te(l)),ge=Math.max(l.floorFrac,1-de/O),_e=[0,1,2].map(e=>Math.min(l.gainCap,Math.max(1/l.gainCap,Math.exp(l.attn[e]*(se-l.zMean))))),ve=Ae(ce,Oe(e.depth,i,a,m,h,y),_e.map((e,t)=>Math.max(e*l.wb[t],l.waterWb[t])),le),M=ve.c,ye=Pe(ve.snrR),P=je(l.waterWb[0],_e[0]*l.wb[0],ve.snrR),be=[0,0,0];for(let e=0;e<3;e++){let t=M[e],n=Math.max(t-ue[e],t*l.floorFrac),r=t*ge+(n-t*ge)*he,i=_e[e]*l.wb[e];be[e]=r*(e===0?1+(i-1)*ye:i)}let xe=Q(l.confLo,l.confHi,pe),Se=Q(st.lo,st.hi,pe),Ce=vt(l),we=l.backdropFit,Ee=Ce>0&&we&&we.length===18?g(me[0],A,j,i,a,we):1,ke=Math.min(xe,Math.max(oi(A,j,l)*(1+(Ee-1)*Ce),Se,Te(l)*N.greenObj)),Ie=ae*Q(ct.lo,ct.hi,O),Le=1+(Ee-1)*Ce,Re=Math.max(Math.min(Z(S,0,1),Le)*C+ke*(1-C),Ie)*xe*(1-Ce*Xr(m,h,y)),ze=e.settings.subjectPop?Z(l.subjectTone??0,0,1):0,Be=Ce>0&&we&&we.length===18?v(me[0],A,j,i,a,we):1,Ve=Ce>0&&we&&we.length===18?Math.max(li(e.depth,i,a,Z(S,0,1)*C,Be),s*Q(c.subjLo,c.subjHi,Be)):0,[He,Ue]=fi(e.depth,i,a),F=e.seg&&e.settings.subjectPop?Ir(e.seg.strength,i,a,e.seg.guide):null,We=e.settings.subjectPop?_t(e.settings):0,[,Ge,Ke]=w(l.veilColor[0],l.veilColor[1],l.veilColor[2]),qe=Math.hypot(Ge,Ke)||1,Je=Math.max(Ve,Ce>0?Ue*Q(c.holdLo,c.holdHi,Be):0)*Ce*ze*He;if(e.debug)return[C,ke,Z(S,0,1)];let I=[0,0,0],Ye=l.exposure**+l.waterExposure,Xe=1-u.dehaze*Math.min(.9,de/O)*Q(lt.lo,lt.hi,O);for(let e=0;e<3;e++){let t=M[e]*(e===0?P:l.waterWb[e])*Ye*Xe;I[e]=t+(be[e]*l.exposure-t)*Re}let Ze=dt(l,u.hazeLift),Qe=1;if(Ze[0]+Ze[1]+Ze[2]>0){let e=ie(I[0],I[1],I[2]),t=ii(A,j,l),n=ft(e,u.hazeLift*l.hazeBlack*(1-ut.farKeep));for(let e=0;e<3;e++)I[e]*=ft(I[e],Ze[e])+(n-ft(I[e],Ze[e]))*t;Qe=e>1e-6?ie(I[0],I[1],I[2])/e:1}let L=ie(I[0],I[1],I[2]),tt=L+((L-l.black)/(l.white-l.black)-L)*l.levelsMix,R=L>1e-5?Math.max(0,tt)/L:1;for(let e=0;e<3;e++)I[e]*=R;L=Math.max(0,tt);let z=Math.cbrt(Math.max(0,L)),nt=F?Rr(F,me,Ge/qe,Ke/qe,ze,We):0,rt=(F?nt:H.engineKeep*Jr(Je)*(ht.edgeFloor+(1-ht.edgeFloor)*Q(c.subjLo,c.subjHi,Be)))*Q(H.darkLo,H.darkHi,z),at=Math.max(vt(l),F?Lr(F[3]):0),ot=rt*at*We*(F?1:Q(H.waterLo,H.waterHi,Be)),mt=F?nt*We*Br(F,me,Ge/qe,Ke/qe):0,gt=1-(1-W.farKeep)*Q(yt.cLo,yt.cHi,Math.hypot(A,j))*ii(A,j,l),K=gt*(1-W.bed*Er(l,i,a)*(1-(F?Z(F[4]??1,0,1):0))),bt=F?Math.max(W.farLit,Q(W.farLo,W.farHi,F[4]??1),Math.min(1,4*Z(F[5]??0,0,1))):1,St=mt*Q(U.darkLo,U.darkHi,z)*K*bt,Ct=F?zr(F):Ce>0&&we&&we.length===18?_(i,a,we):-1,wt=F?e.seg.popDir??1:1,Tt=U.sepRange*(1+(U.sepClose-1)*(F?Z(F[4]??1,0,1):0)),Et=Ct>=0?me[0]>=Ct?Q(0,Tt,me[0]-Ct):-Q(0,W.range,Ct-me[0]):wt,Dt=Ct>=0?1-Q(0,W.engineLo,Ct-me[0]):1,Ot=(F?mt*Math.max(0,-Et)*Q(0,X.alphaR+(X.rampIn-X.alphaR)*Z(F[5]??0,0,1),(F[2]-.5)*2*X.alphaR):W.engine*Jr(Je)*Q(c.subjLo,c.subjHi,Be)*Q(H.waterLo,H.waterHi,Be)*at*We*(Ct>=0?Q(W.engineLo,W.engineHi,Ct-me[0]):0))*gt,kt=F?ot:ot*Dt*K;if(u.clarity>0){let t=ne(Z(L,0,1)),n=te(Z(t+(kr(e.clahe,i,a,t)-t)*(u.clarity+H.clarity*kt*(1-Q(H.hiLo,H.hiHi,z))),0,1));R=L>1e-5?n/L:1;for(let e=0;e<3;e++)I[e]*=R}{let e=ie(I[0],I[1],I[2]),t=$n(O,l.shadowFloor)*O*Ye*Qe,n=Math.max(e,t);if(n=Ne(n,O,Te(l)*(1-Re)),n>l.knee&&(n=l.knee+(1-l.knee)*(1-Math.exp(-(n-l.knee)/(1-l.knee)))),e>1e-6){if(n!==e){let t=n/e;I[0]*=t,I[1]*=t,I[2]*=t}}else{let e=n/O;I[0]=ce[0]*e,I[1]=ce[1]*e,I[2]=ce[2]*e}}let[,At,Pt]=w(m,h,y),Ft=Math.hypot(At,Pt),It=w(Math.max(0,I[0]),Math.max(0,I[1]),Math.max(0,I[2])),Lt=It[0],Rt=Pr(Lt,It[1],It[2],At,Pt,Ge/qe,Ke/qe,ze),zt=It[1]*Rt,Bt=It[2]*Rt,Vt=Math.hypot(zt,Bt),Ht=l.chromaK*Ft+l.chromaC0,Ut=Vt>Ht?Ht/Vt:1,Wt=Q(yt.cLo,yt.cHi,Ft)*ii(At,Pt,l),qt=yt.keep*Ft*Wt;Vt>1e-6&&Vt*Ut<qt&&(Ut=qt/Vt),Ut*=u.saturation;let Jt=ai(At,Pt,l,G.farLo,G.farHi);[zt,Bt]=De(Lt,zt,Bt,Te(l)*(1-N.gnObjKeep*Re));let Yt=qr(Lt,zt,Bt,m,h,y,Jt,F?0:rt,at)*Q(H.keepDarkLo,H.keepDarkHi,Lt),Xt=ae*(1-vt(l)*Xr(m,h,y));Ut*=Yr(zt,Bt,m,h,y,Jt,Xt,F?vt(l):at);let[Zt,Qt]=Kr(zt*Ut,Bt*Ut,Ge/qe,Ke/qe,Yt/G.mix),$t=Q(V.castLo,V.castHi,Math.hypot(zt,Bt)*Ut),en=Lt,tn=Zr(en,Zt,Qt,Xt),nn=Qr(en,tn[0],tn[1],u.look,1-oi(A,j,l),Kt(l),Gt(l)),rn=Fe(nn[0],nn[1],nn[2],At,Pt,ae,Jt),an=Me(nn[0],rn[0],rn[1],Te(l),Jt),on=$r(nn[0],an[0],an[1],u.vivid??0,Te(l)),sn=kt>0&&!F?$r(nn[0],an[0],an[1],(u.vivid??0)*(1-H.vividKeep*Math.min(1,kt)),Te(l))[0]:on[0],cn=Ct>=0?Q(V.upLo,V.upHi,me[0]-Ct):1,ln=F?sn:sn+H.lift*kt*wt*4*sn*Math.max(0,1-sn)*(1-Q(H.hiLo,H.hiHi,sn)),un=1+(H.chromaFollowDark+(H.chromaFollow-H.chromaFollowDark)*Q(H.keepDarkLo,H.keepDarkHi,sn))*(ln/Math.max(1e-4,sn)-1);on[0]=ln,on[1]*=un,on[2]*=un;let dn=ri(on[0],on[1],on[2]),fn=Fr(dn[0],dn[1],At,Pt,Z(rt*at,0,1)*Xr(m,h,y)),pn=Q(V.wLo,V.wHi,rt)*(F?0:Q(c.subjLo,c.subjHi,Be))*(u.subjectPop?Math.min(1,2*Math.max(0,u.subjectPopWarmth??0)):0)*V.amount*$t*Nr(on[0])*cn,mn=Mr(on[0],fn[0],fn[1],pn,V.engineTone),J=ei(on[0],mn[0],mn[1],u.blue??0,Te(l));if([J[1],J[2]]=ti(J[1],J[2],e.waterTint??0,Te(l)),[J[1],J[2]]=ni(J[0],J[1],J[2],u.vivid??0),(e.seabed??0)>0){let t=Er(l,i,a)*(1-Wt)*e.seabed;J[0]+=B.lift*t,J[1]+=(Math.cos(B.hue)*B.chroma+B.keep*J[1]-J[1])*t,J[2]+=(Math.sin(B.hue)*B.chroma+B.keep*J[2]-J[2])*t}if(St>0){let t=(O+pt.eps)/(Hr(e.depth,i,a)+pt.eps);[J[0],J[1],J[2]]=Wr(J[0],J[1],J[2],St,t,Ur(F),We>1?St*(1-1/We):0,Et)}if(Ot>0){let t=(O+pt.eps)/(Hr(e.depth,i,a)+pt.eps);[J[0],J[1],J[2]]=Gr(J[0],J[1],J[2],Ot,t)}if((l.toneGamma??1)!==1){let e=Mt(J[0],l.toneGamma),t=Nt(J[0],e,l.toneGamma);J[0]=e,J[1]*=t,J[2]*=t}{let t=Math.hypot(J[1],J[2]),n=jt.k*Ft;if(t>1e-6&&t<n){let r=J[1]*Math.cos(xt.warmDir)+J[2]*Math.sin(xt.warmDir),o=(1-Q(xt.sLo,xt.sHi,r))*Q(jt.cLo,jt.cHi,t)*(1-Re)*(1-Te(l))*(1-Er(l,i,a)*(e.seabed??0)),s=1+(n/t-1)*o;J[1]*=s,J[2]*=s}}if(ae>0){let t=1-Wt;[J[1],J[2]]=et(J[0],J[1],J[2],Q(q.wLo,q.wHi,ae)*t,Q(q.wLo,q.wHi,Xt)*t,Math.max($e(At,Pt),$e(...Vr(e.depth,i,a)),vt(l)))}let hn=o?ui(t,n,r,m,h,y):1,gn=Math.max(Ft,pn*V.cMin*1.5,J[3]);e.lookTap&&e.lookTap(J[0],J[1],J[2],gn,hn,u.strength,e.fitLookGate??0,e.fitLookMix??0);let[_n,vn,yn]=jr(J[0],J[1],J[2],gn,hn,e.fitLook??0,e.fitLookMix??0);if(e.trace){let t=e=>e.map(e=>+e.toFixed(3));Object.assign(e.trace,{subj:Je,srcC:t(M),redS:+ye.toFixed(2),lin:t([m,h,y]),z:+se.toFixed(2),k:+C.toFixed(2),conf:+Re.toFixed(2),veilScale:+D.toFixed(2),B:t(le),sig:+pe.toFixed(2),wSub:+he.toFixed(2),full:t(be),outPreLevels:t(I.map(e=>e)),Y:+L.toFixed(3),C:+Vt.toFixed(3),cMax:+Ht.toFixed(3),scale:+Ut.toFixed(2),o2:t([_n,vn,yn])})}return[t+(_n-t)*u.strength,n+(vn-n)*u.strength,r+(yn-r)*u.strength]}function jr(e,t,n,r,i,a,o,s){let c=Je(e,t,n,a,o,s),l=O(c[0],c[1],c[2],r),[u,d,f]=T(c[0],l[0],l[1]),[p,m,h]=le(u*i,d*i,f*i);return[ne(p),ne(m),ne(h)]}function Mr(e,t,n,r,i=1){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=i*Math.min(V.cMax,Math.max(V.keep*a,V.cMin*Q(V.lLo,V.lHi,e))),s=Math.cos(V.hue),c=Math.sin(V.hue),l=t*s+n*c,u=Math.max(0,1-r)**+V.side,d=l+(o-l)*r,f=s*d+(t-s*l)*u,p=c*d+(n-c*l)*u,m=Math.hypot(f,p),h=Math.min(V.floorKeep*a,V.floor*i);if(m>=h)return[f,p];let g=d>=0?s:t/a,_=d>=0?c:n/a,v=f*g+p*_,y=-v+Math.sqrt(Math.max(0,v*v-m*m+h*h));return[f+g*y,p+_*y]}function Nr(e){return Q(V.litLo,V.litHi,e)*(1-Q(U.hiLo,U.hiHi,e))}function Pr(e,t,n,r,i,a,o,s){let c=Math.hypot(t,n);return s<=0||c<1e-5?1:1-Z(s,0,1)*Q(gt.lLo,gt.lHi,e)*Q(0,gt.srcLo,r*a+i*o)*Q(0,gt.cross,-(t*a+n*o)/c)}function Fr(e,t,n,r,i){let a=Math.hypot(e,t),o=Math.hypot(n,r);if(i*=Q(.01,.04,o),i<=0||a<1e-4)return[e,t];let s=e/a,c=t/a,l=n/o,u=r/o,d=Math.cos(H.hueMax),f=Math.sin(H.hueMax);if(s*l+c*u>=d)return[e,t];let p=Math.sign(l*c-u*s),m=l*d-p*u*f,h=u*d+p*l*f,g=s+(m-s)*i,_=c+(h-c)*i,v=Math.hypot(g,_)||1;return[a*g/v,a*_/v]}function Ir(e,t,n,r){let i=Math.min(Math.max(t*e.width-.5,0),e.width-1),a=Math.min(Math.max(n*e.height-.5,0),e.height-1),o=Math.floor(i),s=Math.floor(a),c=Math.min(o+1,e.width-1),l=Math.min(s+1,e.height-1),u=i-o,d=a-s,f=[0,0,0,0,0,0],p=(e,t,n,r)=>(e+(t-e)*u)*(1-d)+(n+(r-n)*u)*d;for(let i=0;i<4;i++){let a=e.data[(s*e.width+o)*4+i],m=e.data[(s*e.width+c)*4+i],h=e.data[(l*e.width+o)*4+i],g=e.data[(l*e.width+c)*4+i];if(i===0){let e=xr(a),t=xr(m),n=xr(h),r=xr(g);f[0]=p(e[0],t[0],n[0],r[0]),f[4]=p(e[1],t[1],n[1],r[1]),f[5]=p(e[2],t[2],n[2],r[2])}else f[i]=p(a,m,h,g);if(i===2&&r){let i=Math.min(a,m,h,g),p=Math.max(a,m,h,g);if(p-i>1e-4&&i<X.jbuHi&&p>X.jbuLo){let i=r(t,n);if(i>=0){let t=(t,n)=>r((t+.5)/e.width,(n+.5)/e.height),n=fr([(1-u)*(1-d),u*(1-d),(1-u)*d,u*d],[t(o,s),t(c,s),t(o,l),t(c,l)],i),p=n[0]+n[1]+n[2]+n[3];p>1e-5&&(f[2]=(n[0]*a+n[1]*m+n[2]*h+n[3]*g)/p)}}}}return f}function Lr(e){return e>0?Q(X.popLo,X.popHi,e):0}function Rr(e,t,n,r,i,a){if(e[3]<=0)return 0;let o=(e[2]-.5)*2*X.alphaR,s=X.evFar+(1-X.evFar)*Z(e[4]??1,0,1),c=e[0]>=0&&e[0]<=2,l=c?Q(X.evLo*s,X.evHi*s,Math.hypot(t[0]-e[0],t[1]*r-t[2]*n)):1,u=l+(1-l)*Q(X.trustLo,X.trustHi,o);return Q(0,c?X.rampIn+(X.rampEv-X.rampIn)*l*Z(e[5]??0,0,1):X.rampIn,o)*u*Math.max(i,Lr(e[3]))*e[1]*Math.min(1,U.popGate*a)}function zr(e){return e[0]>2?e[0]-br:e[0]}function Br(e,t,n,r){let i=zr(e);if(i<0)return 1;let a=(e[2]-.5)*2*X.alphaR,o=X.evFar+(1-X.evFar)*Z(e[4]??1,0,1),s=Q(U.rimLo*o,U.rimHi*o,Math.hypot(t[0]-i,t[1]*r-t[2]*n));return s+(1-s)*Q(X.trustLo,X.trustHi,a)}function Vr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=t=>{let n=(n,r)=>e.guide[(r*e.width+n)*3+t];return(n(a,o)+(n(s,o)-n(a,o))*l)*(1-u)+(n(a,c)+(n(s,c)-n(a,c))*l)*u},f=w(Math.max(0,d(0)),Math.max(0,d(1)),Math.max(0,d(2)));return[f[1],f[2]]}function Hr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>{let r=(n*e.width+t)*3;return ie(e.guide[r],e.guide[r+1],e.guide[r+2])};return(d(a,o)+(d(s,o)-d(a,o))*l)*(1-u)+(d(a,c)+(d(s,c)-d(a,c))*l)*u}function Ur(e){let t=(e[2]-.5)*2*X.alphaR,n=Z(e[4]??1,0,1);return Q(0,U.edge,t)*(U.farKeep+(1-U.farKeep)*n)}function Wr(e,t,n,r,i,a=1,o=0,s=1){if(r<=0)return[e,t,n];let c=U,l=Z(s,0,1),u=1+(c.vib*Math.min(1,r)+c.boostVib*o)*a*(1-Q(c.vibLo,c.vibHi,Math.hypot(t,n)))*l,d=e*Z(i,c.rMin,c.rMax)**((c.detail*Math.min(1,r)+c.boostDetail*o)*l*(1-Q(c.hiLo,c.hiHi,e)));d+=(c.sep*Math.min(1,r)+c.boostSep*o)*l*4*d*Math.max(0,1-d)*(1-Q(c.hiLo,c.hiHi,e));let f=c.head*Math.max(0,1-e);return d>e&&(d=f>1e-5?e+f*(1-Math.exp(-(d-e)/f)):e),[d,t*u,n*u]}function Gr(e,t,n,r,i){if(r<=0||e<=1e-5)return[e,t,n];let a=W,o=Math.min(a.wMax,r),s=Q(a.spotLo,a.spotHi,i)*(1-Q(a.spotLLo,a.spotLHi,e)),c=Z(i,a.rMin,a.rMax)**+(a.detail*o)*(1-a.k*o*Q(a.toeLo,a.toeHi,e)*(1-s)+a.spot*o*s),l=Math.min(1,c)**+a.chroma;return[e*c,t*l,n*l]}function Z(e,t,n){return e<t?t:e>n?n:e}function Q(e,t,n){let r=Z((n-e)/(t-e),0,1);return r*r*(3-2*r)}function Kr(e,t,n,r,i){let a=Math.hypot(e,t);if(i<=0||a<1e-6)return[e,t];let o=Math.max(0,e*n+t*r),s=Math.max(0,(a-i*Math.min(ht.k*o,ht.cMax))*(1-i*ht.desat));return[e*s/a,t*s/a]}function qr(e,t,n,r,i,a,o,s,c){if(c<=0||s<=0)return 0;let l=Math.hypot(t,n);if(l<1e-5)return 0;let u=(t*Math.cos(G.hue)+n*Math.sin(G.hue))/l,d=Q(Math.cos(G.bandOut),Math.cos(G.bandIn),u),f=1-Q(G.rLo,G.rHi,r/Math.max(1e-4,i,a)),p=Q(G.lLo,G.lHi,e);return c*G.mix*s*(d+(1-d)*f)*f*p*(1-o)}function Jr(e){return Q(G.confLo,G.confHi,e)}function Yr(e,t,n,r,i,a,o,s){if(s<=0)return 1;let c=Math.hypot(e,t);if(c<1e-5)return 1;let l=(e*Math.cos(G.warmHue)+t*Math.sin(G.warmHue))/c;return 1-s*(1-Q(G.rLo,G.rHi,n/Math.max(1e-4,r,i)))*Q(G.warmLo,G.warmHi,l)*(1-a)*(1-Z(o,0,1))}function Xr(e,t,n){return 1-Q(G.rLo,G.rHi,e/Math.max(1e-4,t,n))}function Zr(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n),a=Math.atan2(n,t),o=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),s=Math.max(1-Q(q.bandIn,q.bandOut,Math.abs(o(a-q.bandHue))),1-Q(q.achroma*.5,q.achroma,i)),c=Q(q.wLo,q.wHi,r)*s*Q(q.lLo,q.lHi,e)*(1-Q(q.cLo,q.cHi,i));if(c<=0)return[t,n];let l=a+o(q.hue-a)*q.mix*c,u=i+Math.max(0,q.cMin-i)*c;return[u*Math.cos(l),u*Math.sin(l)]}function Qr(e,t,n,r,i,a,o=0){if(r<=0)return[e,t,n];let s=Math.hypot(t,n),c=Math.atan2(n,t),l=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),u=Q(K.keepLo,K.keepHi,s),d=(1-Q(K.warmIn,K.warmOut,Math.abs(l(c-K.warmHue))))*Q(K.warmLo+K.warmHaze*a,K.warmHi+K.warmHaze*a,s),f=Q(K.farLo,K.farHi,Math.abs(l(c-K.targetHue))),p=K.darkLo+(K.darkHi-K.darkLo)*(1-K.darkHaze*a),m=(1-u)*(1-d)*(1-Q(K.brightLo,K.brightHi,e))*Q(K.darkLo,p,e)*(1-K.farKeep*(1-a)*f)*r*K.mix,h=Math.max(0,e)**+(1+K.gamma*r)*(1-K.waterDim*r*i*(1-a)),g=Math.max(s,K.c0+K.c1*h),_=Math.max(s,(K.c0+K.c1*h)*(1+K.hazeChroma*a)),v=g+(K.objChroma-g)*a,y=v+(_-v)*Math.max(i,o),b=1-r*K.neutralDesat*(1-Q(K.neutralLo,K.neutralHi,s))*Q(K.neutralLLo,K.neutralLHi,e);return[h,(t+(y*Math.cos(K.targetHue)-t)*m)*b,(n+(y*Math.sin(K.targetHue)-n)*m)*b]}function $r(e,t,n,r,i){if(r<=0)return[e,t,n];let a=bt,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=s-a.target-2*Math.PI*Math.round((s-a.target)/(2*Math.PI)),u=Q(a.cLo,a.cHi,o)*Q(a.lLo,a.lHi,e),d=1-Q(a.bandHi0,a.bandHi1,c),f=Q(a.bandLo0,a.bandLo1,c)*d*(1-Q(a.violetCLo,a.violetCHi,o)*Q(a.target,a.bandHi1,c)),p=Q(a.greenLo0,a.greenLo1,c),m=p*(1-Q(a.greenTop0,a.greenTop1,c)),h=s+((1-i)*f*a.pull*-l+i*m*a.greenShift)*u*r,g=(1-i)*f+i*p*d,_=Q(a.darkCLo,a.darkCHi,o),v=g*_*_*r;o*=1+a.chroma*v*(1-i);let y=e*(1-(a.dark+(a.darkGreen-a.dark)*i)*v*Q(a.darkLLo,a.darkLHi,e));y*=1-a.blackK*r*(1-Q(a.blackLo,a.blackHi,y));let b=a.shadowC0+a.shadowC1*Q(a.shadowLLo,a.shadowLHi,y);o>b&&(o-=(o-b)*(1-a.shadowKeep)*r*(1-Q(a.shadowFadeLo,a.shadowFadeHi,y)));let x=r*(1+(g-1)*Q(0,a.liftNeutralC,o))*Q(a.liftLLo,1,e);y+=a.lift*x*(1-y),o*=1-a.hiDesat*x;let S=a.warmC*x;return[y,o*Math.cos(h)+S*Math.cos(a.warmHue),o*Math.sin(h)+S*Math.sin(a.warmHue)]}function ei(e,t,n,r,i){if(r<=0)return[e,t,n,0];let a=xt,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=Q(a.warmIn0,a.warmIn1,c)*(1-Q(a.warmOut0,a.warmOut1,c))*Q(a.warmCLo,a.warmCHi,o)*Q(a.warmLLo,a.warmLHi,e)*r,u=c+(a.warmHue-c)*a.warmPull*l,d=Math.max(o,Math.min(o*(1+a.warmGain*l),a.warmCMax)),f=d*Math.cos(u),p=d*Math.sin(u),m=t*Math.cos(a.warmDir)+n*Math.sin(a.warmDir),h=1-Q(a.sLo,a.sHi,m),g=Q(a.vcLo,a.vcHi,o)*Q(a.vio0,a.vio1,c)*(1-Q(a.vio2,2*Math.PI,c)),_=Q(a.neutralLLo,a.neutralLHi,e)*(1-Q(a.neutralCLo,a.neutralCHi,o)),v=Math.min(a.cMax,a.cK*e)*(1-a.hiDrop*Q(a.hiLo,a.hiHi,e)),y=Q(a.vegCLo,a.vegCHi,o)*Q(a.vegIn0,a.vegIn1,c)*(1-Q(a.vegOut0,a.vegOut1,c))*(1-a.vegGreen*i),b=Q(a.farLo,a.farHi,a.target-c)*Q(a.farMin0,a.farMin1,c)*Q(a.farCLo,a.farCHi,o),x=a.mix*h*(1-g)*(1-y)*(1-_)*Math.min(1,r*(1+a.farBoost*b));f+=(v*Math.cos(a.target)-f)*x,p+=(v*Math.sin(a.target)-p)*x;let S=1-a.neutralK*_*h*r;return f*=S,p*=S,[e*(1-a.shadowK*r*(1-Q(0,a.shadowHi,e))),f,p,Math.max(v*x,d*l)]}function ti(e,t,n,r){if(n===0)return[e,t];let i=xt,a=Math.hypot(e,t),o=Math.atan2(t,e),s=o<0?o+2*Math.PI:o,c=1-Q(i.sLo,i.sHi,e*Math.cos(i.warmDir)+t*Math.sin(i.warmDir)),l=Q(i.vcLo,i.vcHi,a)*Q(i.vio0,i.vio1,s)*(1-Q(i.vio2,2*Math.PI,s)),u=Q(i.vegCLo,i.vegCHi,a)*Q(i.vegIn0,i.vegIn1,s)*(1-Q(i.vegOut0,i.vegOut1,s))*(1-i.vegGreen*r),d=n*c*(1-l)*(1-u),f=Math.cos(d),p=Math.sin(d);return[e*f-t*p,e*p+t*f]}function ni(e,t,n,r){let i=Math.hypot(t,n);if(r<=0||i<1e-6)return[t,n];let a=Ft,o=Math.atan2(n,t),s=o<0?o+2*Math.PI:o,c=Q(a.warmIn0,a.warmIn1,s)*(1-Q(a.warmOut0,a.warmOut1,s)),l=Q(a.magIn0,a.magIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),u=Q(a.cLo,a.cHi,i)*Q(a.lLo,a.lHi,e)*(1-Q(a.hiLo,a.hiHi,e)),d=Q(a.coolIn0,a.coolIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),f=1+(a.gain*(1-a.coolCut*d)+a.warmGain*c)*(1-l)*u*r*Math.exp(-i/(a.top+(a.warmTop-a.top)*c));return[t*f,n*f]}function ri(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=St,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*Q(i.lLo,i.lHi,e)*(1-Q(i.cLo,i.cHi,r))*(1-Q(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function ii(e,t,n){return ai(e,t,n,n.hueFarLo,n.hueFarHi)}function ai(e,t,n,r,i){let a=Math.hypot(e,t);if(a<n.achroma)return 0;let[,o,s]=w(n.veilColor[0],n.veilColor[1],n.veilColor[2]),c=Math.hypot(o,s)||1,l=Math.max(-1,Math.min(1,(e*o/c+t*s/c)/a));return(1-Q(Math.cos(i),Math.cos(r),l))*Q(n.achroma,n.achroma*2,a)}function oi(e,t,n){let r=Math.hypot(e,t);if(r<n.achroma)return 1;let[,i,a]=w(n.veilColor[0],n.veilColor[1],n.veilColor[2]),o=Math.hypot(i,a)||1,s=Math.max(-1,Math.min(1,(e*i/o+t*a/o)/r)),c=1-Q(Math.cos(n.cosHi),Math.cos(n.cosLo),s),l=Q(n.achroma,n.achroma*2,r);return c+(1-c)*(1-l)}function si(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>e.fields[(n*e.width+t)*4+1];return(d(a,o)*(1-l)+d(s,o)*l)*(1-u)+(d(a,c)*(1-l)+d(s,c)*l)*u}const ci=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];function li(e,t,n,r,i){let a=Math.min(1,Math.max(0,r)),o=0;for(let[r,i]of ci)o=Math.max(o,si(e,t+r*c.ringR/e.width,n+i*c.ringR/e.height));let s=Q(c.subjLo,c.subjHi,i),l=Q(c.coreIn,1,a)*Q(c.coreLo,c.coreHi,i);return Math.max(a*(s+(1-s)*l),Math.min(Math.min(1,o),s))}function ui(e,t,n,r,i,a){let o=ie(te(e),te(t),te(n)),s=ie(r,i,a);return Z((o+pt.eps)/(s+pt.eps),pt.rMin,pt.rMax)}const di=new WeakMap;function fi(e,t,n){let r=e.animals;if(!r)return[0,0];let i=e.strength??di.get(r);i||(i=s(r).data,di.set(r,i));let a=r.width,o=r.height,c=Math.min(a-1,Math.max(0,Math.floor(t*a))),l=Math.min(o-1,Math.max(0,Math.floor(n*o))),u=Math.min(Math.max(t*a-.5,0),a-1),d=Math.min(Math.max(n*o-.5,0),o-1),f=Math.floor(u),p=Math.floor(d),m=Math.min(f+1,a-1),h=Math.min(p+1,o-1),g=u-f,_=d-p,v=(e,t)=>i[(t*a+e)*4+1],y=(v(f,p)*(1-g)+v(m,p)*g)*(1-_)+(v(f,h)*(1-g)+v(m,h)*g)*_;return[i[(l*a+c)*4],y]}const $={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=w(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function pi(e,t,n,r){let i=t*n,a=new Float32Array(i),o=new Float32Array(i);for(let t=0;t<i;t++){let n=.2126*re[e[t*4]]+.7152*re[e[t*4+1]]+.0722*re[e[t*4+2]];a[t]=n,o[t]=n*n}let s=yi(a,t,n,2),c=yi(o,t,n,2),[,l,u]=w(r[0],r[1],r[2]),d=Math.hypot(l,u)||1,f=Math.cos($.hueMax),p=[],m=Math.floor(n*(1-$.near)),h=0,g=0,_=0;for(let r=0;r<n;r+=2)for(let n=0;n<t;n+=2){h++,r>=m&&g++;let i=r*t+n;if(a[i]<$.lumMin)continue;let o=s[i],v=Math.sqrt(Math.max(0,c[i]-o*o));if(v<$.texLo*o||v>$.texHi*o)continue;let[,y,b]=w(re[e[i*4]],re[e[i*4+1]],re[e[i*4+2]]),x=Math.hypot(y,b);x>$.cMax||x>$.achroma&&(y*l+b*u)/(x*d)<f||(p.push(i),r>=m&&_++)}let v=_/Math.max(1,g),y=v>=$.fracHi,b=y?p.filter(e=>e>=m*t):p,x=y?v:p.length/Math.max(1,h);return b.sort((e,t)=>a[t]-a[e]),{idx:b.slice(0,Math.ceil(b.length*$.top)),frac:x}}function mi(e,t,n,r,i,a,o){return s=>{let c=wr({params:vi(i,s),settings:ot,depth:a,clahe:o}),l=0,u=0,d=0;for(let i of r){let r=(i%t+.5)/t,a=(Math.floor(i/t)+.5)/n,o=Ar(c,e[i*4]/255,e[i*4+1]/255,e[i*4+2]/255,r,a);l+=te(o[0]),u+=te(o[1]),d+=te(o[2])}let[,f,p]=w(l/r.length,u/r.length,d/r.length);return[f,p]}}function hi(e,t,n,r){let{idx:i,frac:a}=pi(e,t,n,r.veilColor);if(a<$.fracLo||i.length<12)return null;let o=Math.max(1,Math.floor(i.length/$.samples)),s=[];for(let e=0;e<i.length;e+=o)s.push(i[e]);return{pick:s,frac:a}}function gi(e,t,n,r,i,a){let o=hi(e,t,n,r);return o?{ab:mi(e,t,n,o.pick,r,i,a)([0,0]),frac:o.frac}:null}function _i(e,t,n,r,i,a,o){let s=hi(e,t,n,r);if(!s)return null;let{frac:c}=s,l=mi(e,t,n,s.pick,r,i,a),u=e=>Math.max(-$.maxLog,Math.min($.maxLog,e)),d=e=>Math.hypot(e[0]-o[0],e[1]-o[1]),f=[0,0],p=l(f),m=p;for(let e=0;e<$.iterations&&d(p)>$.tol;e++){let e=l([f[0]+$.eps,f[1]]),t=l([f[0],f[1]+$.eps]),n=(e[0]-p[0])/$.eps,r=(e[1]-p[1])/$.eps,i=(t[0]-p[0])/$.eps,a=(t[1]-p[1])/$.eps,s=n*a-i*r;if(!Number.isFinite(s)||Math.abs(s)<1e-6)break;let c=o[0]-p[0],m=o[1]-p[1],h=(a*c-i*m)/s,g=(-r*c+n*m)/s,_=Math.hypot(h,g);_>$.maxStep&&(h*=$.maxStep/_,g*=$.maxStep/_);let v=!1;for(let e=0;e<3&&!v;e++,h/=2,g/=2){let e=[u(f[0]+h),u(f[1]+g)],t=l(e);d(t)<d(p)&&(f=e,p=t,v=!0)}if(!v)break}return{log:f,frac:c,before:m,after:p}}function vi(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*$.water),a=Math.exp(t[1]*$.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}function yi(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0,s=0;for(let i=Math.max(0,n-r);i<=Math.min(t-1,n+r);i++)o+=e[a*t+i],s++;i[a*t+n]=o/s}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0,c=0;for(let a=Math.max(0,e-r);a<=Math.min(n-1,e+r);a++)s+=i[a*t+o],c++;a[e*t+o]=s/c}return a}function bi(e,t,n=!1){let r=t.backdropFit??e.backdropFit,i={seabedNeed:t.seabedNeed??e.seabedNeed,seabedLw:t.seabedLw??e.seabedLw,seabedLb:t.seabedLb??e.seabedLb,seabedGrid:t.seabedGrid??e.seabedGrid},a=t.frameBlack??t.hazeBlack,o=xi.margin>0&&e.hazeBlack>1e-6?Math.min(1,xi.margin*a/e.hazeBlack):1,s={frameBlack:a,...o<1?{hazeBlack:e.hazeBlack*o,hazeFloor:e.hazeFloor.map(e=>e*o)}:{}};return n?{...e,...i,...s,backdropFit:r}:{...e,...i,...s,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}const xi={margin:1.1},Si={calmLo:.1,calmHi:.4,openLo:.05,openHi:.3},Ci={trendTrust:.5,minSamples:4,kendall:.8,deadband:.1,stepMax:.6,maxRate:.1,maxSwing:Math.log(1.24),spreadLo:.06,spreadHi:.18,residual:.008};function wi(e){let t=e.filter(e=>e.w>0&&Number.isFinite(e.log[0])&&Number.isFinite(e.log[1])).sort((e,t)=>e.t-t.t);if(!t.length)return null;let n=t.map(e=>e.w),r=e=>{let t=Mi(e,n),r=Mi(e.map(e=>Math.abs(e-t)),n);return t*(1-Oi(Ci.spreadLo,Ci.spreadHi,r))},i={t:[Mi(t.map(e=>e.t),n)],r:[r(t.map(e=>e.log[0]))],b:[r(t.map(e=>e.log[1]))]},a=t.filter(e=>e.w>=Ci.trendTrust);if(a.length<Ci.minSamples)return i;let o=a.map(e=>e.t),s=a.map(e=>e.w),c=Ti(o,a.map(e=>e.log[0]),s);return!c||Math.abs(c[c.length-1]-c[0])<Ci.deadband?i:{t:o,r:c,b:Ti(o,a.map(e=>e.log[1]),s)??o.map(()=>Mi(a.map(e=>e.log[1]),s))}}function Ti(e,t,n){let r=t.map((e,n)=>Ai(t[Math.max(0,n-1)],t[n],t[Math.min(t.length-1,n+1)])),i=Ni(r);if(Math.abs(i)<Ci.kendall)return null;let a=Pi(r,n,i>0),o=Math.abs(a[a.length-1]-a[0]);for(let e=1;e<a.length;e++)if(Math.abs(a[e]-a[e-1])>Ci.stepMax*o)return null;let s=a.length>>1;for(let t=s+1;t<a.length;t++)a[t]=ji(a[t],a[t-1],Ci.maxRate*(e[t]-e[t-1]));for(let t=s-1;t>=0;t--)a[t]=ji(a[t],a[t+1],Ci.maxRate*(e[t+1]-e[t]));let c=Math.min(a[0],a[a.length-1]),l=Math.max(a[0],a[a.length-1]),u=l-c>Ci.maxSwing?Ci.maxSwing/(l-c):1,d=(c+l)/2;return a.map(e=>Math.max(-$.maxLog,Math.min($.maxLog,d+(e-d)*u)))}function Ei(e,t,n,r,i){let a=e.map((e,i)=>({px:e,t:t[i]??i,a:Vn(e,n,r)})),o=[],s=[];for(let e of a){if(Di(e.a.params)<.5)continue;let t=gi(e.px,n,r,bi(i,e.a.params),e.a.depth,e.a.clahe);!t||t.frac<$.fracHi||(o.push(t.ab[0]),s.push(t.ab[1]))}if(o.length<2)return null;let c=[Math.min(ki(o),$.neutral[0]+$.pinkMax),ki(s)],l=[];for(let e of a){let t=Di(e.a.params);if(t<=0)continue;let a=_i(e.px,n,r,bi(i,e.a.params),e.a.depth,e.a.clahe,c);if(!a)continue;let o=Math.max(Math.abs(a.log[0]),Math.abs(a.log[1]))>=$.maxLog-1e-6,s=Math.hypot(a.after[0]-c[0],a.after[1]-c[1])>Ci.residual;!o&&!s&&l.push({t:e.t,log:a.log,w:Oi($.fracLo,$.fracHi,a.frac)*t})}return{target:c,curve:wi(l),samples:l}}function Di(e){let t=Math.max(e.calm??0,e.calmTone??0),n=Oi(Si.openLo,Si.openHi,e.backdrop??0);return(1-Oi(Si.calmLo,Si.calmHi,t))*(1-n)*(1-Te(e))}function Oi(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function ki(e){let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function Ai(e,t,n){return Math.max(Math.min(e,t),Math.min(Math.max(e,t),n))}function ji(e,t,n){return Math.max(t-n,Math.min(t+n,e))}function Mi(e,t){let n=e.map((e,n)=>({x:e,w:Math.max(0,t[n]??0)})).filter(e=>e.w>0).sort((e,t)=>e.x-t.x);if(!n.length)return 0;let r=n.reduce((e,t)=>e+t.w,0)/2,i=0;for(let e=0;e<n.length;e++){if(i+=n[e].w,Math.abs(i-r)<1e-12&&e+1<n.length)return(n[e].x+n[e+1].x)/2;if(i>r)return n[e].x}return n[n.length-1].x}function Ni(e){let t=0,n=0;for(let r=0;r<e.length;r++)for(let i=r+1;i<e.length;i++)t+=Math.sign(e[i]-e[r]),n++;return n?t/n:0}function Pi(e,t,n){let r=n?e:e.map(e=>-e),i=[];for(let e=0;e<r.length;e++)for(i.push({sum:r[e]*t[e],w:t[e],n:1});i.length>1&&i[i.length-2].sum/i[i.length-2].w>i[i.length-1].sum/i[i.length-1].w;){let e=i.pop(),t=i[i.length-1];t.sum+=e.sum,t.w+=e.w,t.n+=e.n}let a=[];for(let e of i)for(let t=0;t<e.n;t++)a.push((n?1:-1)*(e.sum/e.w));return a}self.onmessage=e=>{if(e.data.kind===`balance`){let{id:t,width:n,height:r,shots:i}=e.data,a={kind:`balance`,id:t,shots:i.map(e=>{let t=Ei(e.thumbs.map(e=>new Uint8ClampedArray(e)),e.times,n,r,e.lock);return t?{target:t.target,curve:t.curve}:null})};self.postMessage(a);return}let{id:t,rgba:n,width:r,height:i,seeds:a}=e.data,o=performance.now(),s=Vn(new Uint8ClampedArray(n),r,i,{seeds:a}),c=nn(s.depth),l=an(s.depth),u=on(s.clahe),d={id:t,params:s.params,mean:s.mean,fields:{width:s.depth.width,height:s.depth.height,data:c},guide:{width:s.depth.width,height:s.depth.height,data:l},clahe:{tilesX:s.clahe.tilesX,tilesY:s.clahe.tilesY,bins:s.clahe.bins,data:u},animals:s.depth.animals,blobs:s.depth.blobs,...s.depth.popConf?{popConf:s.depth.popConf}:{},ms:performance.now()-o},f=[c.buffer,l.buffer,u.buffer];s.depth.animals&&f.push(s.depth.animals.labels.buffer),s.depth.popConf&&f.push(s.depth.popConf.buffer),self.postMessage(d,f)};