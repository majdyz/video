const e={thr:.25,minArea:.0012,covLo:.6,covHi:.75,weightLo:.5,weightHi:.8,core:.85,coreDev:.08,trimLo:.2,trimHi:.4,erode:2,holeMax:.3,matchIoU:.2,containK:.75,smallCells:160,nearK:.75,nearMin:2.5,nearRatio:2.5,nearIoU:.7,graceS:.35,stabLo:.4,stabHi:.6,confTau:.3,confLo:.4,confHi:.7,tauUp:1,tauDown:.5,leadMaxS:.4,leadMaxCells:12,dilate:2,tapReach:3,bindAhead:.3};function t(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function n(n,i,a,o,s,c,l){let u=a*o,d=new Int32Array(u).fill(-1),f=new Int32Array(u),p=[];for(let r=0;r<u;r++){if(d[r]>=0||n[r]<e.thr)continue;let s=p.length,c=0,m=0,h=0,g=0,_=0,v=0,y=0;for(f[c++]=r,d[r]=s;c>0;){let r=f[--c],u=r%a,p=(r-u)/a;m++,h+=u,g+=p,n[r]>_&&(_=n[r]),l&&l[r]>y&&(y=l[r]),v+=n[r]>=e.core?t(0,e.coreDev,i[r]):t(e.trimLo,e.trimHi,i[r]);for(let t=-1;t<=1;t++)for(let r=-1;r<=1;r++){let i=u+r,l=p+t;if((r|t)===0||i<0||l<0||i>=a||l>=o)continue;let m=l*a+i;d[m]<0&&n[m]>=e.thr&&(d[m]=s,f[c++]=m)}}p.push({area:m/u,sx:h,sy:g,weight:_*(1-y),cov:v/m,px:m})}let m=p.map((e,t)=>t).filter(t=>p[t].area>=e.minArea).sort((e,t)=>p[t].area-p[e].area).slice(0,255),h=new Int32Array(p.length).fill(0),g=[];for(let e of m){let t=p[e];g.push({cx:(t.sx/t.px+.5)*s/a-.5,cy:(t.sy/t.px+.5)*c/o-.5,area:t.area,weight:t.weight,coverage:t.cov}),h[e]=g.length}let _=new Uint8Array(s*c);for(let e=0;e<c;e++){let t=Math.min(o-1,Math.floor((e+.5)*o/c));for(let n=0;n<s;n++){let r=Math.min(a-1,Math.floor((n+.5)*a/s)),i=d[t*a+r];_[e*s+n]=i>=0?h[i]:0}}return r(_,s,c,g.length),{width:s,height:c,labels:_,list:g}}function r(t,n,r,i){let a=n*r,o=new Uint8Array(a),s=new Int32Array(a);for(let c=1;c<=i;c++){let i=0;for(let e=0;e<a;e++)t[e]===c&&i++;if(!i)continue;o.fill(0);let l=0;for(let e=0;e<n;e++)for(let i of[0,r-1]){let r=i*n+e;t[r]!==c&&!o[r]&&(o[r]=1,s[l++]=r)}for(let e=0;e<r;e++)for(let r of[0,n-1]){let i=e*n+r;t[i]!==c&&!o[i]&&(o[i]=1,s[l++]=i)}for(;l>0;){let e=s[--l],r=e%n;for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}for(let r=0;r<a;r++){if(o[r]||t[r]===c)continue;let u=[],d=!0;for(o[r]=1,s[l++]=r;l>0;){let e=s[--l],r=e%n;u.push(e),t[e]!==0&&(d=!1);for(let i of[r>0?e-1:-1,r<n-1?e+1:-1,e>=n?e-n:-1,e<a-n?e+n:-1])i>=0&&!o[i]&&t[i]!==c&&(o[i]=1,s[l++]=i)}if(d&&u.length<=e.holeMax*i)for(let e of u)t[e]=c}}}function i(n){return t(e.weightLo,e.weightHi,n.weight)*t(e.covLo,e.covHi,n.coverage)}function a(e,t,n,r){if(r<=0)return e;let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0;for(let i=-r;i<=r;i++){let r=n+i;r>=0&&r<t&&(o=Math.max(o,e[a*t+r]))}i[a*t+n]=o}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0;for(let a=-r;a<=r;a++){let r=e+a;r>=0&&r<n&&(s=Math.max(s,i[r*t+o]))}a[e*t+o]=s}return a}function o(t,n,r){let i=a(t,n,r,e.dilate),o=e.erode,s=new Uint8Array(n*r);for(let e=0;e<r;e++){let r=0;for(let i=-o;i<n;i++){let a=+(i+o<n&&t[e*n+i+o]<=0),c=+(i-o-1>=0&&t[e*n+i-o-1]<=0);r+=a-c,i>=0&&(s[e*n+i]=+(t[e*n+i]>0&&r===0))}}let c=new Float32Array(n*r*4);for(let e=0;e<n;e++){let t=0;for(let a=-o;a<r;a++){let l=+(a+o<r&&!s[(a+o)*n+e]),u=+(a-o-1>=0&&!s[(a-o-1)*n+e]);if(t+=l-u,a>=0){let r=a*n+e;c[r*4]=i[r],c[r*4+1]=+(t===0)}}}return{width:n,height:r,data:c}}function s(e){let t=new Float32Array(e.width*e.height),n=e.list.map(i);for(let r=0;r<t.length;r++)e.labels[r]&&(t[r]=n[e.labels[r]-1]);return o(t,e.width,e.height)}const c={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,smallLo:.0015,smallHi:.0022,smallDevLo:.16,smallDevHi:.24,smallValidLo:.45,smallValidHi:.6,strongDevLo:.38,strongDevHi:.48,smallMax:14,clutterLo:18,clutterHi:24,lineThick:3,lineSpan:.9,rimShare:.7,rimSpan:.5,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3};function l(e,t,n){for(let n=0;n<6;n++){let r=n;for(let t=n+1;t<6;t++)Math.abs(e[t*6+n])>Math.abs(e[r*6+n])&&(r=t);if(Math.abs(e[r*6+n])<1e-12)return!1;if(r!==n){for(let t=0;t<6;t++){let i=e[n*6+t];e[n*6+t]=e[r*6+t],e[r*6+t]=i}let i=t[n];t[n]=t[r],t[r]=i}for(let r=n+1;r<6;r++){let i=e[r*6+n]/e[n*6+n];if(i!==0){for(let t=n;t<6;t++)e[r*6+t]-=i*e[n*6+t];t[r]-=i*t[n]}}}for(let r=5;r>=0;r--){let i=t[r];for(let t=r+1;t<6;t++)i-=e[r*6+t]*n[t];n[r]=i/e[r*6+r]}return!0}function u(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const d=c.abWeight*c.abWeight,f=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n,p=(e,t,n)=>e[0]+e[1]*t+e[2]*n+e[3]*t*t+e[4]*t*n+e[5]*n*n;function m(e,t,n,r,i,a,o,s,f){let m=i*a;o.fill(0,0,m),s?.fill(0),f?.fill(1,0,m);let g=c.step,_=Math.ceil(i/g),v=Math.ceil(a/g),y=_*v,b=new Float32Array(y),x=new Float32Array(y),S=new Float32Array(y),C=new Float32Array(y),ee=new Float32Array(y),te=new Float32Array(y),w=0;for(let o=0,s=0;o<v;o++)for(let c=0;c<_;c++,s++){let l=Math.min(i-1,c*g),u=Math.min(a-1,o*g),d=u*i+l;b[s]=(l+.5)/i-.5,x[s]=(u+.5)/a-.5,S[s]=e[d],C[s]=t[d],ee[s]=n[d],te[s]=r[d],w+=te[s]}if(w<y*.3)return 0;let T=new Float32Array(y).fill(1),E=new Float32Array(y),D=new Float64Array(36),O=new Float64Array(36),ne=new Float64Array(6),k=new Float64Array(6),re=new Float64Array(6),A=new Float64Array(6),ie=new Float64Array(6),j=new Float64Array(6),ae=new Float64Array(6),oe=new Float64Array(6),M=new Uint32Array(256),se=.05;for(let e=0;e<c.iterations;e++){D.fill(0),ne.fill(0),k.fill(0),re.fill(0);for(let e=0;e<y;e++){let t=te[e]*T[e];if(t<=1e-6)continue;let n=b[e],r=x[e];oe[0]=1,oe[1]=n,oe[2]=r,oe[3]=n*n,oe[4]=n*r,oe[5]=r*r;for(let n=0;n<6;n++){let r=oe[n]*t;for(let e=n;e<6;e++)D[n*6+e]+=r*oe[e];ne[n]+=r*S[e],k[n]+=r*C[e],re[n]+=r*ee[e]}}for(let e=0;e<6;e++)for(let t=0;t<e;t++)D[e*6+t]=D[t*6+e];if(O.set(D),A.set(ne),!l(O,A,ie)||(O.set(D),A.set(k),!l(O,A,j))||(O.set(D),A.set(re),!l(O,A,ae)))return 0;M.fill(0);let e=0;for(let t=0;t<y;t++){let n=b[t],r=x[t],i=S[t]-p(ie,n,r),a=C[t]-p(j,n,r),o=ee[t]-p(ae,n,r),s=Math.sqrt(i*i+d*(a*a+o*o));E[t]=s,te[t]>.5&&(M[Math.min(255,s*1e3|0)]++,e++)}if(e<50)return 0;let t=0,n=0;for(;n<256&&(t+=M[n],!(t*2>=e));n++);se=Math.max(.004,1.4826*(n+.5)/1e3);for(let e=0;e<y;e++){let t=E[e]/(2.5*se);T[e]=1/(1+t*t)}}let ce=Math.min(c.devLo,c.inlierK*se),le=0;for(let e=0;e<y;e++)E[e]<ce&&le++;let ue=u(c.inlierLo,c.inlierHi,le/y)*(1-u(c.rmsLo,c.rmsHi,se));if(ue<=0)return 0;if(s)for(let e=0;e<6;e++)s[e]=ie[e],s[6+e]=j[e],s[12+e]=ae[e];for(let r=0;r<a;r++){let s=(r+.5)/a-.5;for(let a=0;a<i;a++){let l=(a+.5)/i-.5,m=r*i+a,h=e[m]-p(ie,l,s),g=h>0?h:h*c.darkWeight,_=t[m]-p(j,l,s),v=n[m]-p(ae,l,s),y=d*(_*_+v*v);if(o[m]=Math.sqrt(g*g+y),f){let e=h>0?h:h*c.vetoDark;f[m]=u(c.vetoLo,c.vetoHi,Math.sqrt(e*e+y))}}}let de=new Float32Array(m),fe=new Float32Array(m);for(let e=1;e<a-1;e++)for(let t=1;t<i-1;t++){let n=e*i+t,r=o[n+1]-o[n-1],a=o[n+i]-o[n-i];de[n]=.5*Math.sqrt(r*r+a*a)}h(de,fe,i,a,c.edgeRadius);let pe=new Int32Array(m).fill(-1),me=new Int32Array(m);for(let e=0;e<m;e++){if(pe[e]>=0||o[e]<c.devLo)continue;let t=0,n=0;for(me[t++]=e,pe[e]=e;t>0;){let r=me[--t];fe[r]>n&&(n=fe[r]);let a=r%i;a>0&&pe[r-1]<0&&o[r-1]>=c.devLo&&(pe[r-1]=e,me[t++]=r-1),a<i-1&&pe[r+1]<0&&o[r+1]>=c.devLo&&(pe[r+1]=e,me[t++]=r+1),r>=i&&pe[r-i]<0&&o[r-i]>=c.devLo&&(pe[r-i]=e,me[t++]=r-i),r<m-i&&pe[r+i]<0&&o[r+i]>=c.devLo&&(pe[r+i]=e,me[t++]=r+i)}de[e]=n}for(let e=0;e<m;e++){let t=pe[e]>=0?Math.max(fe[e],de[pe[e]]):fe[e];o[e]=ue*u(c.devLo,c.devHi,o[e])*u(c.edgeLo,c.edgeHi,t)}return ue}function h(e,t,n,r,i){let a=new Float32Array(n*r),o=(e,t,n,r,a,o)=>{let s=2*i+1,c=new Float32Array(n+s),l=new Float32Array(n+s);for(let u=0;u<r;u++){let r=u*a,d=t=>{let a=t-i;return a<0||a>=n?0:e[r+a*o]},f=n+2*i;for(let e=0;e<f;e++)c[e]=e%s===0?d(e):Math.max(c[e-1],d(e));for(let e=f-1;e>=0;e--)l[e]=e===f-1||(e+1)%s===0?d(e):Math.max(l[e+1],d(e));for(let e=0;e<n;e++)t[r+e*o]=Math.max(l[e],c[e+2*i])}};o(e,a,n,r,n,1),o(a,t,r,n,1,n)}function g(e,t,n,r,i,a,o=c.vetoLo,s=c.vetoHi){return u(o,s,_(e,t,n,r,i,a))}function _(e,t,n,r,i,a){let o=r-.5,s=i-.5,l=e=>a[e]+a[e+1]*o+a[e+2]*s+a[e+3]*o*o+a[e+4]*o*s+a[e+5]*s*s,u=e-l(0),f=u>0?u:u*c.vetoDark,p=t-l(6),m=n-l(12);return Math.sqrt(f*f+d*(p*p+m*m))}const v={minPx:10,maxArea:.5,splitPx:60};function y(e,t,n,r,i,a,o,s){let c=0,l=0,u=0,d=n,f=0,p=r,m=0;for(let r=0;r<t;r++){let t=e[r],a=t%n,o=(t-a)/n;c+=a,l+=o,u+=i[t],a<d&&(d=a),a>f&&(f=a),o<p&&(p=o),o>m&&(m=o)}let h=c/t,g=l/t,_=f-d>=m-p,y=i=>{let a=0,o=0,s=0;for(let r=0;r<t;r++){let t=e[r],c=t%n,l=(t-c)/n;i&&Math.sign(_?c-h:l-g)!==i||(a+=c,o+=l,s++)}if(!s)return null;a/=s,o/=s;let c=0,l=0,u=1/0;for(let r=0;r<t;r++){let t=e[r],s=t%n,d=(t-s)/n;if(i&&Math.sign(_?s-h:d-g)!==i)continue;let f=(s-a)**2+(d-o)**2;f<u&&(u=f,c=s,l=d)}return[(c+.5)/n,(l+.5)/r]},b=y(0),x=[b];if(t>=v.splitPx)for(let e of[-1,1]){let t=y(e);t&&x.push(t)}return{u:b[0],v:b[1],pts:x,x0:d/n,y0:p/r,x1:(f+1)/n,y1:(m+1)/r,area:t/(n*r),dev:u/t,accept:a,seeded:o,bubble:s}}function b(e,t,n,r,i,a,o,s,l,d,p,m,g,_,b){let C=r*i;if(a.fill(0,0,C),b?.fill(0,0,C),n<=0)return 0;let ee=b?u(c.smallValidLo,c.smallValidHi,n):0,te=[],w=0,T=new Uint8Array(C);for(let e of d??[]){let t=Math.round(e.u*r-.5),n=Math.round(e.v*i-.5),a=c.seedR;for(let e=Math.max(0,n-a);e<=Math.min(i-1,n+a);e++)for(let n=Math.max(0,t-a);n<=Math.min(r-1,t+a);n++)T[e*r+n]=1}let E=null;if(l){let e=new Float32Array(C);for(let t=0;t<C;t++)e[t]=+(l[t]<.5);E=new Float32Array(C),h(e,E,r,i,c.farMargin)}let D=0,O=new Int32Array(C).fill(-1),ne=new Int32Array(C),k=new Int32Array(C),re=new Uint8Array(C),A=c.seedFrac*n,ie=e=>{let n=e%r,i=(n<r-1?t[e+1]:t[e])-(n>0?t[e-1]:t[e]),a=(e<C-r?t[e+r]:t[e])-(e>=r?t[e-r]:t[e]);return .5*Math.sqrt(i*i+a*a)};for(let n=0;n<C;n++){if(O[n]>=0||E&&E[n]>0||e[n]<A&&t[n]<c.growDev)continue;let l=0,d=0,h=!1,j=0,ae=0,oe=!1,M=r,se=0,ce=i,le=0,ue=0,de=0,fe=0,pe=0;for(ne[l++]=n,O[n]=n;l>0;){let a=ne[--l];k[d++]=a;{let e=a%r,n=(a-e)/r;e<M&&(M=e),e>se&&(se=e),n<ce&&(ce=n),n>le&&(le=n),ue+=t[a],n<c.lineThick&&de++,e<c.lineThick&&fe++,e>=r-c.lineThick&&pe++}if(e[a]>=A&&(h=!0),T[a]&&(oe=!0),o&&s){let e=(a%r+.5)/r-.5,t=(Math.floor(a/r)+.5)/i-.5;o[a]-f(s,e,t)>c.lightDL&&ae++}let u=ie(a);u>j&&(j=u);let p=a%r,m=[p>0?a-1:-1,p<r-1?a+1:-1,a>=r?a-r:-1,a<C-r?a+r:-1];for(let r of m)r>=0&&O[r]<0&&!(E&&E[r]>0)&&(t[r]>=c.growDev||e[r]>=A)&&(O[r]=n,ne[l++]=r)}let me=h?1:u(c.growEdgeLo,c.growEdgeHi,j),he=se-M+1,ge=le-ce+1;(he>c.lineSpan*r&&ge<=c.lineThick||ge>c.lineSpan*i&&he<=c.lineThick)&&(me=0),(de>=c.rimShare*d&&he>c.rimSpan*r||Math.max(fe,pe)>=c.rimShare*d&&ge>c.rimSpan*i)&&(me=0);{let e=0;for(let t=0;t<d;t++)k[t]>=C-r&&e++;me*=1-u(c.bottomLo,c.bottomHi,e/r)}if(E){let e=0,t=0;for(let i=0;i<d;i++){let a=k[i],o=a%r,s=[o>0?a-1:-1,o<r-1?a+1:-1,a>=r?a-r:-1,a<C-r?a+r:-1];for(let r of s)r>=0&&O[r]!==n&&(e++,E[r]>0&&t++)}me*=1-u(c.farShareLo,c.farShareHi,t/Math.max(1,e))}let N=o&&s&&p&&m?x(k,d,O,n,r,i,o,p,m,s,t):null;if(N&&g){let e=S(N);if(e>0)for(let t=0;t<d;t++)g[k[t]]=e}let P=o&&s?u(c.lightShareLo,c.lightShareHi,ae/d):1;if(D=Math.max(D,P*me*u(c.minArea,2*c.minArea,d/C)),b&&ee>0&&h&&!oe&&d/C<2*c.minArea){let n=me*ee*u(c.smallLo,c.smallHi,d/C)*u(c.smallDevLo,c.smallDevHi,ue/d)*(1-(N?S(N):0));if(n>0){let r=new Float32Array(d);for(let e=0;e<d;e++)r[e]=t[k[e]];r.sort();let i=c.relKeep*r[Math.min(d-1,Math.floor(.9*d))];te.push({cells:k.slice(0,d).filter(n=>t[n]>=i||e[n]>=A),k:n,lit:P})}}d>=v.minPx&&w++,_&&d>=v.minPx&&d/C<=v.maxArea&&_.push(y(k,d,r,i,t,me,h,N?S(N):0));let _e=oe?+(d/C>=.25*c.minArea):me*u(1.5*c.minArea,2*c.minArea,d/C);if(_e<=0)continue;re[n]=oe?2:1;let F=new Float32Array(d);for(let e=0;e<d;e++)F[e]=t[k[e]];F.sort();let ve=c.relKeep*F[Math.min(d-1,Math.floor(.9*d))];for(let n=0;n<d;n++)(t[k[n]]>=ve||e[k[n]]>=A)&&(a[k[n]]=_e)}let j=new Float32Array(C);h(a,j,r,i,c.closeR);for(let e=0;e<C;e++)j[e]=1-j[e];h(j,a,r,i,c.closeR);for(let e=0;e<C;e++)a[e]=1-a[e];let ae=new Uint8Array(C);for(let e=0;e<C;e++){if(ae[e]||a[e]<=0)continue;let n=0,i=0,o=0,s=new Set;for(ne[n++]=e,ae[e]=1;n>0;){let e=ne[--n];k[i++]=e,O[e]>=0&&re[O[e]]&&s.add(O[e]),t[e]>=c.solidDev&&o++;let l=e%r;for(let t=-1;t<=1;t++)for(let i=-1;i<=1;i++){let o=l+i,s=e+t*r+i;(i|t)===0||o<0||o>=r||s<0||s>=C||ae[s]||a[s]<=0||(ae[s]=1,ne[n++]=s)}}let l=!1;for(let e of s)re[e]===2&&(l=!0);let d=l?1:s.size>=c.schoolN?0:u(c.solidLo,c.solidHi,o/i);if(d<1&&b&&!l&&s.size<c.schoolN){let e=0;for(let n=0;n<i;n++)e+=t[k[n]];let n=u(c.strongDevLo,c.strongDevHi,e/i);if(n>d)for(let e=0;e<i;e++)b[k[e]]=Math.max(b[k[e]],a[k[e]]*n)}if(d<1)for(let e=0;e<i;e++)a[k[e]]*=d}let oe=1-u(c.clutterLo,c.clutterHi,w);if(b&&te.length&&te.length<=c.smallMax&&oe>0)for(let e of te){let t=e.k*oe;for(let n of e.cells)t>a[n]&&t>b[n]&&(b[n]=t);D=Math.max(D,e.lit*t)}return D}function x(e,t,n,r,i,a,o,s,c,l,u){let d=i*a,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=i,S=0,C=a,ee=0;for(let te=0;te<t;te++){let t=e[te],w=t%i,T=(t-w)/i;y+=w,b+=T,x=Math.min(x,w),S=Math.max(S,w),C=Math.min(C,T),ee=Math.max(ee,T);let E=(w+.5)/i-.5,D=(T+.5)/a-.5,O=l[6]+l[7]*E+l[8]*D+l[9]*E*E+l[10]*E*D+l[11]*D*D,ne=l[12]+l[13]*E+l[14]*D+l[15]*E*E+l[16]*E*D+l[17]*D*D;h+=o[t]-f(l,E,D),g+=Math.hypot(s[t],c[t])/Math.max(.001,Math.hypot(O,ne));let k=w>0&&T>0&&w<i-1&&T<a-1;if(k&&n[t-1]===r&&n[t+1]===r&&n[t-i]===r&&n[t+i]===r)p+=Math.hypot(o[t+1]-o[t-1],o[t+i]-o[t-i])*.5,m++;else if(k){let e=0;for(let n=1;n<=2;n++)for(let r of[t-n,t+n,t-n*i,t+n*i])r>=0&&r<d&&(e=Math.max(e,Math.abs(u[t]-u[r])/n));_+=e,v++}}return{tex:m?p/m:0,dL:h/t,cr:g/t,aspect:(ee-C+1)/(S-x+1),sharp:v?_/v:0,cx:y/t,cy:b/t}}function S(e){return(1-u(c.bubbleTexLo,c.bubbleTexHi,e.tex))*u(c.bubbleCrLo,c.bubbleCrHi,e.cr)*u(c.bubbleDLLo,c.bubbleDLHi,e.dL)*u(c.bubbleTallLo,c.bubbleTallHi,e.aspect)}function C(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function ee(e){return e<=0?0:e>=1?1:e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}const te=(()=>{let e=new Float32Array(256);for(let t=0;t<256;t++)e[t]=C(t/255);return e})();function w(e,t,n){return .2126*e+.7152*t+.0722*n}const T=Math.cbrt;function E(e,t,n){let r=T(.4122214708*e+.5363325363*t+.0514459929*n),i=T(.2119034982*e+.6806995451*t+.1073969566*n),a=T(.0883024619*e+.2817188376*t+.6299787005*n);return[.2104542553*r+.793617785*i-.0040720468*a,1.9779984951*r-2.428592205*i+.4505937099*a,.0259040371*r+.7827717662*i-.808675766*a]}function D(e,t,n){let r=e+.3963377774*t+.2158037573*n,i=e-.1055613458*t-.0638541728*n,a=e-.0894841775*t-1.291485548*n,o=r*r*r,s=i*i*i,c=a*a*a;return[4.0767416621*o-3.3077115913*s+.2309699292*c,-1.2684380046*o+2.6097574011*s-.3413193965*c,-.0041960863*o-.7034186147*s+1.707614701*c]}function O(e,t){let n=Math.atan2(t,e)*180/Math.PI;return n<0?n+360:n}const ne=.7,k=.7,re=.94;function A(e){return e[0]>=0&&e[1]>=0&&e[2]>=0&&e[0]<=1&&e[1]<=1&&e[2]<=1}function ie(e,t,n){let r=0,i=.4;for(let a=0;a<10;a++){let a=.5*(r+i);A(D(e,t*a,n*a))?r=a:i=a}return r}function j(e,t,n,r=0){let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=t/i,o=n/i,s=ie(e,a,o),c=k*s;if(i<=c||s<=1e-5)return[t,n];let l=re*s-c,u=Math.min(i,r,re*s),d=Math.max(u,c+l*(1-Math.exp(-(i-c)/l)));return[a*d,o*d]}function ae(e,t,n){let r=Math.max(e,t,n);if(r>1){let i=Math.max(ne,1/r);e*=i,t*=i,n*=i}return oe(e,t,n)}function oe(e,t,n){let r=Math.min(1,Math.max(0,w(e,t,n))),i=1,a=[e,t,n];for(let e=0;e<3;e++){let t=a[e];t>1?i=Math.min(i,(1-r)/(t-r)):t<0&&(i=Math.min(i,(0-r)/(t-r)))}return i>=1?[e,t,n]:(i=Math.max(0,i),[r+i*(e-r),r+i*(t-r),r+i*(n-r)])}const M={hueLo:-30*Math.PI/180,hueHi:70*Math.PI/180,warmC:.06,warmL:.2,warmLo:.012,warmHi:.05,rgY:.15,rgLo:.78,rgHi:.95,bgLo0:.45,bgLo1:.6,bgHi0:1.25,bgHi1:1.5,floorLo:.15,floorHi:.3,floorMin:.015,floorWarmLo:1.05,floorWarmHi:1.2,floorMagentaLo:.85,floorMagentaHi:1,hazeLo:.2,hazeHi:.35,redToneLo:.06,redToneHi:.12,colourMax:.9,toneMax:.9,toneLookOff:.4,knee:.97};function se(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}const ce=1024,le={rg:new Uint32Array(ce),bg:new Uint32Array(ce),r:new Uint32Array(ce),g:new Uint32Array(ce),b:new Uint32Array(ce)},ue=.25;function de(e,t){return Math.min(ce-1,Math.max(0,ce/t*e|0))}function fe(e,t,n,r){let i=n*t,a=0;for(let t=0;t<ce;t++)if(a+=e[t],a>=i)return(t+.5)*r/ce;return r}function pe(e,t){for(let e of Object.values(le))e.fill(0);let n=0,r=0,i=0,a=(M.hueLo+M.hueHi)/2,o=Math.cos(a),s=Math.sin(a),c=Math.cos((M.hueHi-M.hueLo)/2);for(let a=0;a<t;a+=3){let t=e[a*3],l=e[a*3+1],u=e[a*3+2];if(r++,le.r[de(t,ue)]++,le.g[de(l,ue)]++,le.b[de(u,ue)]++,.2126*t+.7152*l+.0722*u>=M.rgY){let e=1/Math.max(1e-4,l);le.rg[de(t*e,4)]++,le.bg[de(u*e,4)]++,i++}if(t<=l*.9)continue;let[d,f,p]=E(t,l,u),m=Math.hypot(f,p);d>=M.warmL&&m>=M.warmC&&(f*o+p*s)/m>=c&&n++}let l=n/Math.max(1,r),u=i>=r*.02,d=u?fe(le.rg,i,.5,4):0,f=u?fe(le.bg,i,.5,4):0,p=fe(le.r,r,.02,ue),m=Math.max(fe(le.g,r,.02,ue),fe(le.b,r,.02,ue)),h=m<M.floorMin?1:p/m,g=se(M.rgLo,M.rgHi,d)*se(M.bgLo0,M.bgLo1,f)*(1-se(M.bgHi0,M.bgHi1,f))*se(M.floorLo,M.floorHi,h)*(1-se(M.floorWarmLo,M.floorWarmHi,h)*se(M.floorMagentaLo,M.floorMagentaHi,f));return{warm:l,rg:d,bg:f,floor:h,reds:se(M.warmLo,M.warmHi,l),noCast:g}}function me(e,t){let n=1-se(M.hazeLo,M.hazeHi,t),r=e.noCast*n,i=se(M.redToneLo,M.redToneHi,e.warm)*n;return{calm:M.colourMax*Math.max(e.reds,r),calmTone:M.toneMax*Math.max(r,i)}}function he(e){let t=Math.min(1,Math.max(0,e.calm??0)),n=Math.min(1,Math.max(0,e.calmTone??0));if(t<=0&&n<=0)return e;let r=e=>Math.max(1e-4,e)**(1-t),i=1-n;return{...e,wb:e.wb.map(r),waterWb:e.waterWb.map(r),attn:e.attn.map(e=>e*(1-t)),binf:e.binf.map(e=>e*(1-t)),exposure:Math.max(1e-4,e.exposure)**+i,levelsMix:e.levelsMix*i,toneGamma:1+((e.toneGamma??1)-1)*(1-Math.min(1,Math.max(t/M.colourMax,n/M.toneMax)/M.toneLookOff)),haze:e.haze*i,hazeBlack:e.hazeBlack*i,hazeFloor:e.hazeFloor.map(e=>e*i),knee:e.knee+(Math.max(e.knee,M.knee)-e.knee)*n}}function ge(e,t){let n=Math.min(1,Math.max(0,t.calmTone??0));return n<=0?e:{...e,clarity:e.clarity*(1-n),dehaze:e.dehaze*(1-n)}}const N=Math.PI/180,P={sigma:2,gainLo:1.25,gainHi:2,keepLo:15,keepHi:40,tolFrac:.35,tolLin:.004,snrLo:1.5,snrHi:6,snrMin:.25,waterRed:.8,waterSnrLo:4,waterSnrHi:12,hue:15*N,bandIn:35*N,bandOut:60*N,cMax:.15,knee:.65,pinkHue:5*N,pinkIn:40*N,pinkOut:60*N,whiteLo:.55,whiteHi:.78,whiteC:.015,magHue:335*N,magIn:35*N,magOut:55*N,magLLo:.35,magLHi:.5,magDir:45*N,magSrcLo:-.008,magSrcHi:.004,magCLo:.05,magCHi:.12,skinHueMin:15*N,skinCMax:.085,skinSrcCLo:.07,skinSrcCHi:.11,greenLo:1.15,greenHi:1.8,greenRMax:5,greenBMax:3,greenWater:.7,greenDehaze:.85,greenObj:.9,greenProp:.6,greenWarmR:1.1,greenWarmB:.9,veilGreenLo:1.35,veilGreenHi:1.85,veilChromaLo:.03,veilChromaHi:.06,greenLevelLo:.03,greenLevelHi:.08,gnHue:150*N,gnIn:20*N,gnOut:45*N,gnMix:.75,gnObjKeep:.7,gnTargetHue:240*N,gnTargetC:.012,matHue:70*N,matIn:40*N,matOut:65*N,matC:.05,matKnee:.6,litLo:.35,litHi:.55,litSub:3,murkHold:1,murkDark:.75,murkLo:.08,murkHi:.25};function _e(e,t,n){return e<t?t:e>n?n:e}function F(e,t,n){let r=_e((n-e)/(t-e),0,1);return r*r*(3-2*r)}function ve(e,t){return xe(e,t)*(1-be(t))}function ye(e,t){return xe(e,t)*be(t)}function be(e){return e?F(P.litLo,P.litHi,.2126*e[0]+.7152*e[1]+.0722*e[2]):0}function xe(e,t){let n=F(P.greenLo,P.greenHi,e[1]/Math.max(1e-4,e[2])),r=t?F(P.veilGreenLo,P.veilGreenHi,t[1]/Math.max(1e-4,t[2]))*F(P.veilChromaLo,P.veilChromaHi,Se(t)):0;return Math.max(n,r)*F(P.greenLevelLo,P.greenLevelHi,e[1])}function Se(e){let[,t,n]=E(Math.max(0,e[0]),Math.max(0,e[1]),Math.max(0,e[2]));return Math.hypot(t,n)}function Ce(e){return ve(e.binf,e.veilColor)*(1-Math.min(1,Math.max(0,e.calm??0)))}function we(e,t){let n=P.greenDehaze*Ce(t);return n>e.dehaze?{...e,dehaze:Math.min(1,n)}:e}function Te(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n);if(i<1e-5)return[t,n];let a=F(Math.cos(P.gnOut),Math.cos(P.gnIn),(t*Math.cos(P.gnHue)+n*Math.sin(P.gnHue))/i),o=P.gnMix*r*a,s=P.gnTargetC*_e(e/.6,0,1.3);return[t+(s*Math.cos(P.gnTargetHue)-t)*o,n+(s*Math.sin(P.gnTargetHue)-n)*o]}function Ee(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of y){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*.12*.12));h+=f*c,g+=f*l,_+=f*u,v+=f}if(v<1e-6)return[r,i,a];let b=Math.min(1,v/.08);return[r+(h/v-r)*b,i+(g/v-i)*b,a+(_/v-a)*b]}function De(e,t){return 255*Math.max(0,ee(Math.max(0,e))-ee(Math.max(0,Math.min(e,t))))/P.sigma}function Oe(e,t,n,r){let i=[0,0,0],a=0;for(let e=0;e<3;e++){let o=De(t[e],r[e]);e===0&&(a=o),i[e]=F(P.gainLo,P.gainHi,n[e]/Math.max(1e-4,n[1]))*(1-F(P.keepLo,P.keepHi,o))}let o=[.2126,.7152,.0722],s=0,c=0;for(let n=0;n<3;n++){let r=o[n]*(1-.95*i[n]);s+=r*e[n],c+=r*t[n]}let l=c>1e-6?s/c:1,u=[e[0],e[1],e[2]];for(let n=0;n<3;n++){let r=P.tolFrac*e[n]+P.tolLin,a=_e(t[n]*l,e[n]-r,e[n]+r);u[n]=e[n]+(a-e[n])*i[n]}return{c:u,snrR:a}}function ke(e,t,n){let r=P.waterRed*F(P.waterSnrLo,P.waterSnrHi,n);return e*Math.max(1,t/Math.max(1e-4,e))**+r}function Ae(e,t,n,r,i){if(r<=0)return[t,n];let a=Math.hypot(t,n),o=P.matKnee*P.matC;if(a<=o)return[t,n];let s=F(Math.cos(P.matOut),Math.cos(P.matIn),(t*Math.cos(P.matHue)+n*Math.sin(P.matHue))/a),c=r*(1-i)*s*F(.2,.3,e)*(1-F(.85,.95,e));if(c<=0)return[t,n];let l=P.matC-o,u=a+(o+l*(1-Math.exp(-(a-o)/l))-a)*c;return[t*u/a,n*u/a]}function je(e,t,n){let r=t*(P.murkDark+(1-P.murkDark)*F(P.murkLo,P.murkHi,t));return n<=0||e<=r?e:e+(r-e)*n*P.murkHold}function Me(e){return P.snrMin+(1-P.snrMin)*F(P.snrLo,P.snrHi,e)}function Ne(e,t,n,r,i,a,o){let s=Math.hypot(t,n);if(s<1e-5)return[t,n];let c=F(Math.cos(P.bandOut),Math.cos(P.bandIn),(t*Math.cos(P.hue)+n*Math.sin(P.hue))/s),l=F(Math.cos(P.pinkOut),Math.cos(P.pinkIn),(t*Math.cos(P.pinkHue)+n*Math.sin(P.pinkHue))/s),u=Math.hypot(r,i),d=F(.1,.5,a)*(1-F(P.skinSrcCLo,P.skinSrcCHi,u))*(1-o)*F(.3,.45,e),f=Math.atan2(n,t);if(d>0){let e=f<P.skinHueMin&&f>-Math.PI/2?P.skinHueMin:f;f+=(e-f)*d}let p=P.cMax+(P.whiteC-P.cMax)*F(P.whiteLo,P.whiteHi,e)*l*(1-d),m=F(Math.cos(P.magOut),Math.cos(P.magIn),(t*Math.cos(P.magHue)+n*Math.sin(P.magHue))/s)*(1-F(P.magSrcLo,P.magSrcHi,r*Math.cos(P.magDir)+i*Math.sin(P.magDir)))*F(P.magLLo,P.magLHi,e)*(1-F(P.magCLo,P.magCHi,s))*(1-d);p=Math.min(p,P.cMax+(P.whiteC-P.cMax)*m),p+=(Math.min(p,P.skinCMax)-p)*d;let h=u>1e-5?(r*Math.cos(P.hue)+i*Math.sin(P.hue))/u:0,g=u*F(Math.cos(P.bandOut),Math.cos(P.bandIn),h);p=Math.max(p,g);let _=Math.max(c,l,d,m),v=Math.max(P.knee*p,g),y=s;if(y>v&&_>0){let e=p-v,t=v+e*(1-Math.exp(-(y-v)/Math.max(1e-6,e)));y+=(t-y)*_}return y===s&&d<=0?[t,n]:[y*Math.cos(f),y*Math.sin(f)]}const Pe=`
const float RED_SIGMA = ${P.sigma.toFixed(4)};
const float RED_GAIN_LO = ${P.gainLo.toFixed(4)};
const float RED_GAIN_HI = ${P.gainHi.toFixed(4)};
const float RED_KEEP_LO = ${P.keepLo.toFixed(4)};
const float RED_KEEP_HI = ${P.keepHi.toFixed(4)};
const float RED_TOL_FRAC = ${P.tolFrac.toFixed(4)};
const float RED_TOL_LIN = ${P.tolLin.toFixed(5)};
const float RED_SNR_LO = ${P.snrLo.toFixed(4)};
const float RED_SNR_HI = ${P.snrHi.toFixed(4)};
const float RED_SNR_MIN = ${P.snrMin.toFixed(4)};
const float RED_WATER_RED = ${P.waterRed.toFixed(4)};
const float RED_WATER_SNR_LO = ${P.waterSnrLo.toFixed(4)};
const float RED_WATER_SNR_HI = ${P.waterSnrHi.toFixed(4)};
const float RED_HUE_COS = ${Math.cos(P.hue).toFixed(6)};
const float RED_HUE_SIN = ${Math.sin(P.hue).toFixed(6)};
const float RED_COS_IN = ${Math.cos(P.bandIn).toFixed(6)};
const float RED_COS_OUT = ${Math.cos(P.bandOut).toFixed(6)};
const float RED_PINK_COS = ${Math.cos(P.pinkHue).toFixed(6)};
const float RED_PINK_SIN = ${Math.sin(P.pinkHue).toFixed(6)};
const float RED_PINK_COS_IN = ${Math.cos(P.pinkIn).toFixed(6)};
const float RED_PINK_COS_OUT = ${Math.cos(P.pinkOut).toFixed(6)};
const float RED_MAG_COS = ${Math.cos(P.magHue).toFixed(6)};
const float RED_MAG_SIN = ${Math.sin(P.magHue).toFixed(6)};
const float RED_MAG_COS_IN = ${Math.cos(P.magIn).toFixed(6)};
const float RED_MAG_COS_OUT = ${Math.cos(P.magOut).toFixed(6)};
const float RED_MAG_L_LO = ${P.magLLo.toFixed(4)};
const float RED_MAG_L_HI = ${P.magLHi.toFixed(4)};
const float RED_MAG_DIR_COS = ${Math.cos(P.magDir).toFixed(6)};
const float RED_MAG_DIR_SIN = ${Math.sin(P.magDir).toFixed(6)};
const float RED_MAG_SRC_LO = ${P.magSrcLo.toFixed(4)};
const float RED_MAG_SRC_HI = ${P.magSrcHi.toFixed(4)};
const float RED_MAG_C_LO = ${P.magCLo.toFixed(4)};
const float RED_MAG_C_HI = ${P.magCHi.toFixed(4)};
const float RED_C_MAX = ${P.cMax.toFixed(4)};
const float RED_KNEE = ${P.knee.toFixed(4)};
const float RED_WHITE_LO = ${P.whiteLo.toFixed(4)};
const float RED_WHITE_HI = ${P.whiteHi.toFixed(4)};
const float RED_WHITE_C = ${P.whiteC.toFixed(4)};
const float RED_SKIN_HUE_MIN = ${P.skinHueMin.toFixed(6)};
const float RED_SKIN_C_MAX = ${P.skinCMax.toFixed(4)};
const float RED_SKIN_SRC_C_LO = ${P.skinSrcCLo.toFixed(4)};
const float RED_SKIN_SRC_C_HI = ${P.skinSrcCHi.toFixed(4)};
const float RED_GREEN_PROP = ${P.greenProp.toFixed(4)};
const float RED_GREEN_OBJ = ${P.greenObj.toFixed(4)};
const float RED_MAT_COS = ${Math.cos(P.matHue).toFixed(6)};
const float RED_MAT_SIN = ${Math.sin(P.matHue).toFixed(6)};
const float RED_MAT_COS_IN = ${Math.cos(P.matIn).toFixed(6)};
const float RED_MAT_COS_OUT = ${Math.cos(P.matOut).toFixed(6)};
const float RED_MAT_C = ${P.matC.toFixed(4)};
const float RED_MAT_KNEE = ${P.matKnee.toFixed(4)};
const float RED_MURK_HOLD = ${P.murkHold.toFixed(4)};
const float RED_MURK_DARK = ${P.murkDark.toFixed(4)};
const float RED_MURK_LO = ${P.murkLo.toFixed(4)};
const float RED_MURK_HI = ${P.murkHi.toFixed(4)};
const float RED_GN_COS = ${Math.cos(P.gnHue).toFixed(6)};
const float RED_GN_SIN = ${Math.sin(P.gnHue).toFixed(6)};
const float RED_GN_COS_IN = ${Math.cos(P.gnIn).toFixed(6)};
const float RED_GN_COS_OUT = ${Math.cos(P.gnOut).toFixed(6)};
const float RED_GN_OBJ_KEEP = ${P.gnObjKeep.toFixed(4)};
const float RED_GN_MIX = ${P.gnMix.toFixed(4)};
const float RED_GN_TA = ${(P.gnTargetC*Math.cos(P.gnTargetHue)).toFixed(6)};
const float RED_GN_TB = ${(P.gnTargetC*Math.sin(P.gnTargetHue)).toFixed(6)};
`,Fe=Pe.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),Ie=`${Pe}
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
}`,Le=`${Fe}
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
}`,Re=[`sh`,`mid`,`hi`,`rot`,`sat`,`coolSat`,`warmSat`,`satL`,`shA`,`shB`,`hiA`,`hiB`],I={sh:0,mid:0,hi:0,rot:0,sat:0,coolSat:0,warmSat:0,satL:0,shA:0,shB:0,hiA:0,hiB:0};25*Math.PI/180;const ze={cool:240*Math.PI/180,coolIn:50*Math.PI/180,coolOut:95*Math.PI/180,warm:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:80*Math.PI/180,protLo:.015,protHi:.05},Be={vivid:{...I},blue:{...I}},L=e=>Math.min(1,Math.max(0,e));function Ve(e,t,n){let r=L((n-e)/(t-e));return r*r*(3-2*r)}const He=256/27;function Ue(e){let t=L(e),n=1-t;return[He*t*n*n*n,16*t*t*n*n,He*t*t*t*n]}const We=(e,t,n)=>{if(n<=0)return e;let r={...e};for(let i of Re)r[i]=e[i]+(t[i]-e[i])*n;return r};function Ge(e,t,n,r,i=0,a=Be){if(r<=0)return[e,t,n];let o=We(a.vivid,a.blue,L(i)),s=ze,c=L(e),[l,u,d]=Ue(c),f=e+r*(o.sh*l+o.mid*u+o.hi*d),p=Math.hypot(t,n),m=0,h=0;if(p>1e-6){let e=Math.atan2(n,t),r=t=>{let n=e-t;return Math.abs(n-2*Math.PI*Math.round(n/(2*Math.PI)))};m=1-Ve(s.coolIn,s.coolOut,r(s.cool)),h=1-Ve(s.warmIn,s.warmOut,r(s.warm))}let g=r*o.rot*m,_=Math.cos(g),v=Math.sin(g),y=Math.max(0,1+r*(o.sat+o.coolSat*m+o.warmSat*h+o.satL*(2*c-1))),b=r*(1-h*Ve(s.protLo,s.protHi,p));return[f,(t*_-n*v)*y+b*(o.shA*l+o.hiA*d),(t*v+n*_)*y+b*(o.shB*l+o.hiB*d)]}const R=e=>Re.every(t=>e[t]===0);function Ke(e,t,n=Be){let r=Je(t);return r<1&&!R(n.vivid)||r>0&&!R(n.blue)?qe(e,t):0}function qe(e,t){let n=L(Math.max(e.calm??0,e.calmTone??0)),r=Je(t),i=L(e.vividGate??1),a=i+(L(e.blueGate??e.vividGate??1)-i)*r;return L(t.vivid??0)*(1-Ve(yt.calmLo,yt.calmHi,n))*(1-Ve(Dt.calmLo,Dt.calmHi,n))*a}function Je(e){return L(e.blue??0)}const Ye={hue:45*Math.PI/180,warmIn:60*Math.PI/180,warmOut:100*Math.PI/180,hueKeep:.4,knee:.05,cap:.08,rest:.03,restMix:.5,coolCut:.85,srcLo:.035,srcHi:.065,coolLo:.03,coolHi:.055,lLo:.3,lHi:.45,hiLo:.86,hiHi:.95};function Xe(e,t){let n=Ye,r=Math.hypot(e,t);return r<1e-6?0:Ve(n.srcLo,n.srcHi,r)*(1-Ve(Math.cos(n.warmOut),Math.cos(n.warmIn),(e*Math.cos(n.hue)+t*Math.sin(n.hue))/r))}function Ze(e,t,n,r,i,a=0){if(r<=0&&i<=0)return[t,n];let o=Ye,s=Math.cos(o.hue),c=Math.sin(o.hue),l=Math.hypot(t,n),u=t*s+n*c,d=n*s-t*c,f=l>1e-6?Ve(Math.cos(o.warmOut),Math.cos(o.warmIn),u/l):0,p=L(r)*f;d*=1-(1-o.hueKeep)*p;let m=Math.hypot(u,d),h=1-o.coolCut*L(a),g=o.knee*h,_=(o.cap-o.knee)*h;if(m>g){let e=1+((g+_*(1-Math.exp(-(m-g)/_)))/m-1)*p;u*=e,d*=e}let v=L(i)*o.restMix*Ve(o.lLo,o.lHi,e)*(1-Ve(o.hiLo,o.hiHi,e))*(1-Ve(o.coolLo,o.coolHi,l));return u+=(Math.max(u,o.rest)-u)*v,d*=1-v,[u*s-d*c,u*c+d*s]}const z=e=>{let t=e.toFixed(7).replace(/0+$/,``);return t.endsWith(`.`)?t+`0`:t},Qe=e=>t=>`mix(${z(e.vivid[t])}, ${z(e.blue[t])}, m)`,B=ze,V=Ye;function $e(e=Be){let t=Qe(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
float fitLookDist(float h, float h0) { float d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
vec3 fitLook(vec3 lab, float t, float m) {
  if (t <= 0.0) return lab;
  float x = clamp(lab.x, 0.0, 1.0), y = 1.0 - x;
  float S = ${z(He)} * x * y * y * y, M = 16.0 * x * x * y * y, H = ${z(He)} * x * x * x * y;
  float L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  float C = length(lab.yz);
  float cool = 0.0, warm = 0.0;
  if (C > 1e-6) {
    float h = atan(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${z(B.coolIn)}, ${z(B.coolOut)}, fitLookDist(h, ${z(B.cool)}));
    warm = 1.0 - smoothstepf(${z(B.warmIn)}, ${z(B.warmOut)}, fitLookDist(h, ${z(B.warm)}));
  }
  float ang = t * ${t(`rot`)} * cool, cs = cos(ang), sn = sin(ang);
  float k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  float tw = t * (1.0 - warm * smoothstepf(${z(B.protLo)}, ${z(B.protHi)}, C));
  return vec3(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
float skinGuardCool(vec2 ab0) {
  float C = length(ab0);
  if (C < 1e-6) return 0.0;
  return smoothstepf(${z(V.srcLo)}, ${z(V.srcHi)}, C) * (1.0 - smoothstepf(${z(Math.cos(V.warmOut))}, ${z(Math.cos(V.warmIn))}, dot(ab0, vec2(${z(Math.cos(V.hue))}, ${z(Math.sin(V.hue))})) / C));
}
vec2 skinGuard(vec3 lab, float cap, float rest, float cool) {
  if (cap <= 0.0 && rest <= 0.0) return lab.yz;
  vec2 d = vec2(${z(Math.cos(V.hue))}, ${z(Math.sin(V.hue))});
  float C = length(lab.yz);
  float s = dot(lab.yz, d), o = lab.z * d.x - lab.y * d.y;
  float warm = C > 1e-6 ? smoothstepf(${z(Math.cos(V.warmOut))}, ${z(Math.cos(V.warmIn))}, s / C) : 0.0;
  float kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${z(1-V.hueKeep)} * kw;
  float C1 = length(vec2(s, o));
  float lim = 1.0 - ${z(V.coolCut)} * clamp(cool, 0.0, 1.0), knee = ${z(V.knee)} * lim, room = ${z(V.cap-V.knee)} * lim;
  if (C1 > knee) {
    float q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  float kr = clamp(rest, 0.0, 1.0) * ${z(V.restMix)} * smoothstepf(${z(V.lLo)}, ${z(V.lHi)}, lab.x) * (1.0 - smoothstepf(${z(V.hiLo)}, ${z(V.hiHi)}, lab.x)) * (1.0 - smoothstepf(${z(V.coolLo)}, ${z(V.coolHi)}, C));
  s += (max(s, ${z(V.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2(s * d.x - o * d.y, s * d.y + o * d.x);
}`}function et(e=Be){let t=Qe(e);return`// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
fn fitLookDist(h: f32, h0: f32) -> f32 { let d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
fn fitLook(lab: vec3<f32>, t: f32, m: f32) -> vec3<f32> {
  if (t <= 0.0) { return lab; }
  let x = clamp(lab.x, 0.0, 1.0);
  let y = 1.0 - x;
  let S = ${z(He)} * x * y * y * y;
  let M = 16.0 * x * x * y * y;
  let H = ${z(He)} * x * x * x * y;
  let L1 = lab.x + t * (${t(`sh`)} * S + ${t(`mid`)} * M + ${t(`hi`)} * H);
  let C = length(lab.yz);
  var cool = 0.0;
  var warm = 0.0;
  if (C > 1e-6) {
    let h = atan2(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${z(B.coolIn)}, ${z(B.coolOut)}, fitLookDist(h, ${z(B.cool)}));
    warm = 1.0 - smoothstepf(${z(B.warmIn)}, ${z(B.warmOut)}, fitLookDist(h, ${z(B.warm)}));
  }
  let ang = t * ${t(`rot`)} * cool;
  let cs = cos(ang);
  let sn = sin(ang);
  let k = max(0.0, 1.0 + t * (${t(`sat`)} + ${t(`coolSat`)} * cool + ${t(`warmSat`)} * warm + ${t(`satL`)} * (2.0 * x - 1.0)));
  let tw = t * (1.0 - warm * smoothstepf(${z(B.protLo)}, ${z(B.protHi)}, C));
  return vec3<f32>(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${t(`shA`)} * S + ${t(`hiA`)} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${t(`shB`)} * S + ${t(`hiB`)} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
fn skinGuardCool(ab0: vec2<f32>) -> f32 {
  let C = length(ab0);
  if (C < 1e-6) { return 0.0; }
  return smoothstepf(${z(V.srcLo)}, ${z(V.srcHi)}, C) * (1.0 - smoothstepf(${z(Math.cos(V.warmOut))}, ${z(Math.cos(V.warmIn))}, dot(ab0, vec2<f32>(${z(Math.cos(V.hue))}, ${z(Math.sin(V.hue))})) / C));
}
fn skinGuard(lab: vec3<f32>, cap: f32, rest: f32, cool: f32) -> vec2<f32> {
  if (cap <= 0.0 && rest <= 0.0) { return lab.yz; }
  let d = vec2<f32>(${z(Math.cos(V.hue))}, ${z(Math.sin(V.hue))});
  let C = length(lab.yz);
  var s = dot(lab.yz, d);
  var o = lab.z * d.x - lab.y * d.y;
  var warm = 0.0;
  if (C > 1e-6) { warm = smoothstepf(${z(Math.cos(V.warmOut))}, ${z(Math.cos(V.warmIn))}, s / C); }
  let kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${z(1-V.hueKeep)} * kw;
  let C1 = length(vec2<f32>(s, o));
  let lim = 1.0 - ${z(V.coolCut)} * clamp(cool, 0.0, 1.0);
  let knee = ${z(V.knee)} * lim;
  let room = ${z(V.cap-V.knee)} * lim;
  if (C1 > knee) {
    let q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  let kr = clamp(rest, 0.0, 1.0) * ${z(V.restMix)} * smoothstepf(${z(V.lLo)}, ${z(V.lHi)}, lab.x) * (1.0 - smoothstepf(${z(V.hiLo)}, ${z(V.hiHi)}, lab.x)) * (1.0 - smoothstepf(${z(V.coolLo)}, ${z(V.coolHi)}, C));
  s += (max(s, ${z(V.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2<f32>(s * d.x - o * d.y, s * d.y + o * d.x);
}`}const tt={mu0:.53214829,mu1:.51309827,mu2:-.91066194},nt={auto:{red:1,blue:1,redMax:5,dehaze:0,clarity:0,exposure:1,hazeLift:0},murky:{red:1.1,blue:1.2,redMax:5,dehaze:.65,clarity:.35,exposure:1.1,hazeLift:.9},deep:{red:1.5,blue:.9,redMax:5,dehaze:.25,clarity:.15,exposure:1.05,hazeLift:.5},reef:{red:1,blue:1,redMax:1.6,dehaze:0,clarity:-.1,exposure:.97,hazeLift:0}},rt={intensity:1,saturation:1,clarity:.15,veil:.7,look:0,preset:`auto`,subjectPop:!1,subjectPopStrength:.5,subjectPopWarmth:.5,seabed:.6,vivid:0,blue:0,noiseReduction:`auto`},it={lo:.55,hi:.78},at={lo:.06,hi:.18},ot={lo:.05,hi:.2},st={floor:.25,soft:.12,chroma:.7,farKeep:.6};function ct(e,t){if(t<=0||e.hazeBlack<=0)return[0,0,0];let n=st.chroma;return e.hazeFloor.map(r=>t*((1-n)*e.hazeBlack+n*Math.min(Math.max(r,0),2*e.hazeBlack)))}function lt(e,t){if(t<=0)return 1;let n=(e-t)/((1-t)*Math.max(e,1e-6)),r=n-st.floor,i=1-st.floor,a=st.soft*st.soft;return .5*(n+st.floor+Math.sqrt(r*r+a))-.5*(Math.sqrt(i*i+a)-i)}const ut={sigma:.009,k:1/(6*.009*.009),eps:.004,rMin:.5,rMax:2},dt=[[-2.5,-2.5,1],[2.5,-2.5,1],[-2.5,2.5,1],[2.5,2.5,1],[-6.5,-1.5,.7],[6.5,1.5,.7],[-1.5,6.5,.7],[1.5,-6.5,.7],[-6.5,1.5,.7],[6.5,-1.5,.7],[1.5,6.5,.7],[-1.5,-6.5,.7]],ft={k:.35,cMax:.045,desat:-.15,edgeFloor:.3},H={hue:75*Math.PI/180,chroma:.02,keep:.15,lift:.06,grid:6,wLo:0,wHi:.55,lo:.1,span:.8,redLo:.12,redHi:.35,bandLo:-.1,bandHi:-.02,y0:.2,y1:.5},U={hue:78*Math.PI/180,cMin:.05,cMax:.075,keep:.4,lLo:.2,lHi:.55,wLo:.03,wHi:.3,side:4,castLo:.015,castHi:.045},W={vividKeep:.8,clarity:.22,lift:.1,chromaFollow:.3,chromaFollowDark:.7,engineKeep:.5,keepDarkLo:.25,keepDarkHi:.4,darkLo:.2,darkHi:.45,hueMax:20*Math.PI/180},G={darkLo:.1,darkHi:.28,popGate:4,cast:.45,castMax:.62,hue:65*Math.PI/180,warm:.014,warmShare:.12,litLo:.1,litHi:.35,hiLo:.85,hiHi:.97,detail:.25,rMin:.7,rMax:1.45,lift:.012,boostWarm:.03,boostWarmShare:.15,boostDetail:.7,boostLift:.025,edge:3,farKeep:.35,veilLo:.065,veilHi:.125,pack:32,levels:16};function pt(e){return 2*Math.min(1,Math.max(0,e.subjectPopStrength??.5))}const K={hue:195*Math.PI/180,bandIn:45*Math.PI/180,bandOut:85*Math.PI/180,rLo:.08,rHi:.3,mix:.92,silver:.022,lLo:.12,lHi:.32,farLo:30*Math.PI/180,farHi:60*Math.PI/180,lift:.05,confLo:.05,confHi:.5,warmHue:50*Math.PI/180,warmLo:.1,warmHi:.5};function mt(e){return Math.min(1,Math.max(0,e.backdrop??0))*(1-Math.min(1,Math.max(0,e.calmTone??0)))}const ht={cLo:.06,cHi:.12,keep:.95},q={gamma:0,dim:.5,liftRelief:.6,liftRef:.1,hazeDehaze:.4,hazeClarity:.4,hazeLevels:.15,waterDim:.25,hazeLo:.05,hazeHi:.3,hazeChroma:2,deepLo:.35,deepHi:.8,objChroma:.045,neutralDesat:.8,neutralLo:.025,neutralHi:.05,neutralLLo:.65,neutralLHi:.8,warmHue:65*Math.PI/180,warmIn:45*Math.PI/180,warmOut:70*Math.PI/180,warmLo:.006,warmHi:.015,warmHaze:.06,brightLo:.6,brightHi:.8,keepLo:.09,keepHi:.14,targetHue:252*Math.PI/180,c0:0,c1:.11,darkLo:.08,darkHi:.45,darkHaze:.6,farLo:50*Math.PI/180,farHi:110*Math.PI/180,farKeep:.55,mix:.8},gt={target:242*Math.PI/180,pull:.6,bandLo0:130*Math.PI/180,bandLo1:225*Math.PI/180,bandHi0:255*Math.PI/180,bandHi1:305*Math.PI/180,violetCLo:.08,violetCHi:.14,greenShift:22*Math.PI/180,greenLo0:85*Math.PI/180,greenLo1:125*Math.PI/180,greenTop0:205*Math.PI/180,greenTop1:240*Math.PI/180,cLo:0,cHi:.1,lLo:.15,lHi:.4,chroma:.1,dark:.2,darkGreen:.1,darkLLo:.3,darkLHi:.6,darkCLo:.015,darkCHi:.16,blackK:.1,blackLo:0,blackHi:.25,shadowC0:.006,shadowC1:.1,shadowLLo:.15,shadowLHi:.6,shadowKeep:.5,shadowFadeLo:.35,shadowFadeHi:.55,liftLLo:.9,liftNeutralC:.04,lift:.08,hiDesat:.45,warmC:.006,warmHue:80*Math.PI/180},_t={target:258*Math.PI/180,mix:.9,warmDir:45*Math.PI/180,sLo:-.05,sHi:.03,vcLo:.07,vcHi:.12,vio0:285*Math.PI/180,vio1:310*Math.PI/180,vio2:345*Math.PI/180,vegIn0:60*Math.PI/180,vegIn1:80*Math.PI/180,vegOut0:150*Math.PI/180,vegOut1:195*Math.PI/180,vegCLo:.02,vegCHi:.04,vegGreen:.8,cK:.24,cMax:.12,hiLo:.55,hiHi:.85,hiDrop:.3,neutralLLo:.35,neutralLHi:.6,neutralCLo:.015,neutralCHi:.05,neutralK:.8,warmHue:62*Math.PI/180,warmIn0:30*Math.PI/180,warmIn1:50*Math.PI/180,warmOut0:82*Math.PI/180,warmOut1:105*Math.PI/180,warmCLo:.015,warmCHi:.045,warmLLo:.2,warmLHi:.4,warmPull:.5,warmGain:.35,warmCMax:.15,shadowK:.25,shadowHi:.4,farLo:50*Math.PI/180,farHi:80*Math.PI/180,farMin0:105*Math.PI/180,farMin1:140*Math.PI/180,farCLo:.02,farCHi:.05,farBoost:.43},vt={hue:355*Math.PI/180,bandIn:30*Math.PI/180,bandOut:55*Math.PI/180,lLo:.86,lHi:.96,cLo:.04,cHi:.08,mix:.85},yt={calmLo:.15,calmHi:.6,veilLLo:.27,veilLHi:.38,liftLo:.08,liftHi:.25,veilCLo:.06,veilCHi:.11,rovKeep:.25};function bt(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function xt(e,t,n){let r=yt,i=bt(r.veilLLo,r.veilLHi,e),a=bt(r.liftLo,r.liftHi,n)*(1-bt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}function St(e,t){return Math.min(1,Math.max(0,t.vivid??0))*Ft(e)*Math.min(1,Math.max(0,e.vividGate??1))}const Ct={sunLo:-.15,sunHi:-.3};function wt(e,t,n){let r=yt,i=Math.max(bt(r.veilLLo,r.veilLHi,e),bt(-Ct.sunLo,-Ct.sunHi,-n)),a=bt(r.liftLo,r.liftHi,n)*(1-bt(r.veilCLo,r.veilCHi,t));return i*(1-(1-r.rovKeep)*a)}const Tt={lo:.1,hi:.45};function Et(e,t){let n=Math.max(0,e);return t>1&&n>0?n**(1+(t-1)*bt(Tt.lo,Tt.hi,n)):n}const Dt={amount:.7,calmLo:.05,calmHi:.3},Ot={gain:.5,top:.15,warmGain:.5,warmTop:.12,warmIn0:10*Math.PI/180,warmIn1:45*Math.PI/180,warmOut0:80*Math.PI/180,warmOut1:115*Math.PI/180,magIn0:285*Math.PI/180,magIn1:320*Math.PI/180,magOut0:330*Math.PI/180,magOut1:360*Math.PI/180,cLo:.01,cHi:.07,lLo:.1,lHi:.3,hiLo:.85,hiHi:.97,coolCut:.6,coolIn0:165*Math.PI/180,coolIn1:215*Math.PI/180},kt={max:4,wbMin:.25,wbMax:5,waterPow:.6,waterMax:3};function At(e){let t=e.wbTap;if(!t||!(t[0]>0)||!(t[1]>0)||!Number.isFinite(t[0])||!Number.isFinite(t[1]))return null;let n=e=>Math.min(kt.max,Math.max(1/kt.max,e)),r=n(t[0]),i=n(t[1]);return r===1&&i===1?null:[r,i]}function jt(e,t){let n=At(t);if(!n)return e;let r=[n[0],1,n[1]],i=e.wb.map((e,t)=>t===1?e:Math.min(kt.wbMax,Math.max(kt.wbMin,e*r[t]))),a=e.waterWb.map((e,t)=>t===1?e:Math.min(kt.waterMax,Math.max(1/kt.waterMax,e*r[t]**+kt.waterPow)));return{...e,wb:i,waterWb:a}}const Mt={teal:35*Math.PI/180,blue:14*Math.PI/180};function Nt(e){let t=Math.min(1,Math.max(-1,e.waterHue??0));return Number.isFinite(t)?t*(t<0?Mt.teal:Mt.blue):0}function Pt(e,t){let n=e=>Math.min(1,Math.max(0,e)),r=n(Math.max(e.calm??0,e.calmTone??0));return Math.max(n(t.blue??0),Dt.amount*n(t.vivid??0))*Ft(e)*(1-bt(Dt.calmLo,Dt.calmHi,r))*n(e.blueGate??e.vividGate??1)}function Ft(e){let t=Math.min(1,Math.max(0,Math.max(e.calm??0,e.calmTone??0)));return 1-bt(yt.calmLo,yt.calmHi,t)}function It(e){return Math.min(1,Math.max(0,e.intensity-1))}function Lt(e){let t=It(e);return{strength:Math.min(1,Math.max(0,e.intensity)),saturation:e.saturation+.35*t,clarity:Math.min(1,e.clarity+.5*t),veil:e.veil+.3*t,look:Math.min(1,Math.max(0,e.look)),dehaze:.6*t,hazeLift:0,subjectPop:!!e.subjectPop,subjectPopStrength:e.subjectPopStrength,subjectPopWarmth:e.subjectPopWarmth}}function Rt(e){let t=Math.min(1,Math.max(0,(e.haze-q.deepLo)/(q.deepHi-q.deepLo)));return t*t*(3-2*t)}function zt(e){return Bt(e.haze)}function Bt(e){let t=Math.min(1,Math.max(0,(e-q.hazeLo)/(q.hazeHi-q.hazeLo)));return t*t*(3-2*t)}function Vt(e,t){let n=nt[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=[Math.min(n.redMax,Math.max(1,e.wb[0]*n.red)),1,Math.min(1.6,Math.max(.5,e.wb[2]*n.blue))],i=[Math.min(2,r[0]**.6),1,Math.min(2,Math.max(.5,r[2]**.6))];return{...e,wb:r,waterWb:i,exposure:e.exposure*n.exposure}}function Ht(e,t){let n=nt[t.preset??`auto`];if(!t.preset||t.preset===`auto`||!n)return e;let r=t.preset===`reef`?Math.min(e.dehaze,.15):Math.min(1,Math.max(e.dehaze,n.dehaze));return{...e,dehaze:r,clarity:Math.min(1,Math.max(0,e.clarity+n.clarity)),hazeLift:Math.max(e.hazeLift,n.hazeLift)}}function Ut(e,t){let n=Math.min(1,Math.max(0,t.look));if(n<=0)return e;let r=zt(e)*n,i=t.hazeAuto===!1?0:Wt.lift*zt(e)*e.hazeBlack,a=q.liftRelief*Math.min(1,i/q.liftRef);return{...e,exposure:e.exposure*(1-q.dim*r*(1-a)),levelsMix:Math.min(.85,e.levelsMix+q.hazeLevels*r)}}const Wt={dehaze:.5,clarity:0,levels:.15,lift:.8};function Gt(e,t){let n=zt(t);return n<=0?e:{...e,dehaze:Math.max(e.dehaze,Wt.dehaze*n),clarity:Math.min(1,e.clarity+Wt.clarity*n),hazeLift:Math.max(e.hazeLift,Wt.lift*n)}}function Kt(e){let t=zt(e);return t<=0?e:{...e,levelsMix:Math.min(.85,e.levelsMix+Wt.levels*t)}}function qt(e,t){let n=e.look;if(n<=0)return e;let r=zt(t)*n;return{...e,dehaze:Math.max(e.dehaze,q.hazeDehaze*r),clarity:Math.min(1,e.clarity+q.hazeClarity*r)}}function Jt(e,t){if(t<=0)return e;let n=1+.8*t,r=e.wb.map(e=>Math.min(5,Math.max(.25,e**+n))),i=1.6+1.4*t,a=.6+.3*t,o=r.map(e=>Math.min(i,Math.max(1/i,e**+a)));return{...e,wb:r,waterWb:o,attn:e.attn.map(e=>e*n),gainCap:e.gainCap+t,levelsMix:Math.min(.85,e.levelsMix+.3*t),chromaK:e.chromaK+t}}const J={hue:45*Math.PI/180,bandHue:65*Math.PI/180,bandIn:50*Math.PI/180,bandOut:75*Math.PI/180,achroma:.012,lLo:.4,lHi:.55,cLo:.07,cHi:.1,mix:1,wLo:.1,wHi:.5,cMin:.05};function Yt(e){return new Float32Array(e.fields)}function Y(e,t){for(let n=0;n<t.length;n++)e[n*4+1]=t[n];return e}function Xt(e){let t=new Float32Array(e.width*e.height*4);for(let n=0;n<e.width*e.height;n++)t[n*4]=e.guide[n*3],t[n*4+1]=e.guide[n*3+1],t[n*4+2]=e.guide[n*3+2],t[n*4+3]=e.person?e.person[n]:0;return t}function Zt(e){let t=e.tilesX*e.tilesY*e.bins,n=new Float32Array(t*4);for(let r=0;r<t;r++)n[r*4]=e.data[r];return n}const Qt=1.1,$t=.12,en=.3,tn=2.2,nn=.1,rn=.4,an=10*Math.PI/180,on=26*Math.PI/180,sn=.025,cn=60*Math.PI/180,ln=110*Math.PI/180,un=30*Math.PI/180,dn=60*Math.PI/180,fn=.8,pn=1.6,mn=3.5,hn=.55,gn=1.5,_n={strength:1,bMin:.8,objLo:0,objHi:0},vn=.14,yn=.86,bn=.5,xn={target:.4,strength:.7,max:1.5},Sn={clip:2,sigLo:.03,sigHi:.1,anchor:1},Cn=.75,wn=.05,Tn={covLo:.3,covHi:.7,clearLo:.7,clearHi:.85,sig:.8,lift:.7},En=.55,Dn=.5,On=.12,kn={low:.75,mid:.5},An=new Map;function X(e,t){let n=An.get(e);return(!n||n.length!==t)&&(n=new Float32Array(t),An.set(e,n)),n}const jn=4096,Mn=new Float32Array(jn+1);for(let e=0;e<=jn;e++)Mn[e]=ee(e/jn);function Nn(e){if(e<=0)return 0;if(e>=1)return 1;let t=e*jn,n=t|0,r=t-n;return Mn[n]+(Mn[n+1]-Mn[n])*r}function Pn(e,t,r,i={}){let a=t*r,o=X(`lin`,a*3),s=X(`d`,a),l=0,u=0,d=0;for(let t=0;t<a;t++){let n=e[t*4],r=e[t*4+1],i=e[t*4+2];o[t*3]=te[n],o[t*3+1]=te[r],o[t*3+2]=te[i];let a=n/255,c=r/255,f=i/255;s[t]=tt.mu0+tt.mu1*Math.max(c,f)+tt.mu2*a,l+=a,u+=c,d+=f}let f=[l/a,u/a,d/a],p=$n($n(s,t,r,2,X(`blurA`,a),X(`blurT`,a)),t,r,2,X(`blurB`,a),X(`blurT`,a)),[h,g]=Zn(p,[.02,.98]),_=Math.max(.02,g-h),v=X(`z`,a);for(let e=0;e<a;e++)v[e]=Vn((p[e]-h)/_);let y=[],x=[[],[],[]],S=X(`lum`,a),C=new Uint8Array(a),ee=new Uint32Array(10),w=new Uint32Array(1280);for(let e=0;e<a;e++){S[e]=Bn(o,e);let t=Math.min(9,v[e]*10|0);C[e]=t,ee[t]++,w[t*128+Math.min(127,Math.sqrt(S[e])*128|0)]++}let T=new Float32Array(10);for(let e=0;e<10;e++){if(ee[e]<24){T[e]=-1;continue}let t=Math.max(6,Math.round(ee[e]*.015)),n=0,r=0;for(;r<128&&(n+=w[e*128+r],!(n>=t));r++);let i=(r+1)/128;T[e]=i*i}for(let e=0;e<a;e++){let t=T[C[e]];t<0||S[e]>t||(y.push(v[e]),x[0].push(o[e*3]),x[1].push(o[e*3+1]),x[2].push(o[e*3+2]))}let D=[0,0,0];{let[e]=Zn(v,[.98]),t=0;for(let n=0;n<a;n++)v[n]<e||(D[0]+=o[n*3],D[1]+=o[n*3+1],D[2]+=o[n*3+2],t++);t>0?(D[0]/=t,D[1]/=t,D[2]/=t):(D[0]=f[0],D[1]=f[1],D[2]=f[2])}let[,O,ne]=E(D[0],D[1],D[2]),k=Math.hypot(O,ne)||1,re=[O/k,ne/k],A=[0,0,0],ie=[0,0,0],j=[0,0,0];{let e=Xn(y,x);for(let t=0;t<3;t++)A[t]=e[t].A,ie[t]=e[t].beta,j[t]=e[t].c}let ae=[A[0],A[1],A[2]],oe=0;for(let e=0;e<a;e++)oe+=v[e];let M=oe/a,se=X(`hueObj`,a),ce=X(`hueFar`,a),le=X(`chroma`,a),ue=X(`veilCos`,a),de=X(`okL`,a),fe=X(`okA`,a),he=X(`okB`,a),ge=X(`bdWater`,a);for(let e=0;e<a;e++){let[t,n,r]=E(o[e*3],o[e*3+1],o[e*3+2]);de[e]=t,fe[e]=n,he[e]=r,ge[e]=1-Wn(n,r,re,un,dn,sn);let i=Math.hypot(n,r);le[e]=i,ue[e]=i>1e-6?(n*re[0]+r*re[1])/i:1,se[e]=Un(n,r,re,an,on,sn),ce[e]=Wn(n,r,re,cn,ln,sn)}let N=X(`bf`,a*3);for(let e=0;e<a;e++){let t=v[e];N[e*3]=A[0]*(1-Math.exp(-(ie[0]*t+j[0]))),N[e*3+1]=A[1]*(1-Math.exp(-(ie[1]*t+j[1]))),N[e*3+2]=A[2]*(1-Math.exp(-(ie[2]*t+j[2])))}let _e=X(`backdrop`,a),F=new Float32Array(18),be=X(`bdDev`,a),xe=Gn(c.blueLo,c.blueHi,D[2]/Math.max(1e-4,D[1])),Se=xe>0?m(de,fe,he,ge,t,r,_e,F,be)*xe:0;if(xe<=0)_e.fill(0,0,a);else if(xe<1)for(let e=0;e<a;e++)_e[e]*=xe;let Ce=X(`objHue`,a);for(let e=0;e<a;e++)Ce[e]=Math.max(se[e]*(1-Se*(1-be[e])),_e[e]);let we=Hn(o,Ce,N,t,r,X(`veilScale`,a)),Te=ve(A,D)*P.greenObj,Ee=P.litSub*ye(A,D),De=.2+Ee,Oe=.55+Ee,ke=X(`J`,a*3),Ae=X(`conf`,a),je=X(`wbWeight`,a),Me=X(`sigArr`,a),Ne=()=>{for(let e=0;e<a;e++){let t=Math.max(1e-5,S[e]),n=Math.min(1,we[e]),r=0,i=0,a=[0,0,0];for(let t=0;t<3;t++){let o=N[e*3+t];a[t]=n*o;let s=t===0?.2126:t===1?.7152:.0722;r+=we[e]*o*s,i+=a[t]*s}let s=Math.max(0,(t-r)/t);Me[e]=s;let c=Gn(De,Oe,s)*(1-ce[e]),l=Math.max(wn,1-i/t);for(let t=0;t<3;t++){let n=o[e*3+t],r=Math.max(n-a[t],n*wn);ke[e*3+t]=n*l+(r-n*l)*c}let u=Gn(nn,rn,s),d=Gn(it.lo,it.hi,s)*(1-Se+_e[e]);Ae[e]=Math.min(u,Math.max(Ce[e],d,Te)),je[e]=Math.sqrt(u)}};Ne();let Pe=0;{let e=0;for(let t=0;t<a;t++)e+=Ae[t];let[n,i]=Zn(Me,[.5,.95]),s=Gn(Tn.covLo,Tn.covHi,e/a)*(1-Gn(Tn.clearLo,Tn.clearHi,i));Pe=s;let c=1+(Math.min(1,(1-Tn.sig)/Math.max(.001,1-n))-1)*s;if(c<.98){for(let e=0;e<3;e++)A[e]*=c;for(let e=0;e<a*3;e++)N[e]*=c;we=Hn(o,Ce,N,t,r,we),Ne()}}let Fe=0,Ie=0,Le=0,Re=0;for(let e=0;e<a;e++){let t=je[e];if(t<=0)continue;let n=ke[e*3],r=ke[e*3+1],i=ke[e*3+2],a=n*n,o=r*r,s=i*i;Fe+=t*a*a*a,Ie+=t*o*o*o,Le+=t*s*s*s,Re+=t}let I=[1,1,1],ze=ve(A,D);if(Re>0){let e=(Fe/Re)**(1/6)+1e-5,t=(Ie/Re)**(1/6)+1e-5,n=(Le/Re)**(1/6)+1e-5;I[0]=Math.min(mn+(P.greenRMax-mn)*ze,Math.max(1,t/e));let r=Math.min(gn+(P.greenBMax-gn)*ze,Math.max(1,A[1]/Math.max(1e-4,A[2])));I[2]=Math.min(r,Math.max(hn,t/n))}let Be=Gn(.01,.06,Re/a);I[0]=1+(I[0]-1)*Be,I[2]=1+(I[2]-1)*Be;let L=(e,t)=>{let n=Math.min(1.15,Math.max(0,v[e]+Math.min(.25,Math.max(-.25,Dn*(s[e]-p[e])/_)))),r=Math.max(1e-5,S[e]),i=0,a=0,c=[0,0,0];for(let t=0;t<3;t++){let r=rt.veil*A[t]*(1-Math.exp(-(ie[t]*n+j[t]))),o=t===0?.2126:t===1?.7152:.0722;c[t]=Math.min(1,we[e])*r,i+=we[e]*r*o,a+=c[t]*o}let l=Gn(De,Oe,Math.max(0,(r-i)/r))*(1-ce[e]),u=Math.max(wn,1-a/r);for(let n=0;n<3;n++){let r=o[e*3+n],i=Math.max(r-c[n],r*wn);t[n]=r*u+(i-r*u)*l}return n};ze>0&&(I[0]*=1+(P.greenWarmR-1)*ze,I[2]*=1+(P.greenWarmB-1)*ze);let Ve=new Uint8Array(a),He=zn(L,Ae,se,le,ue,S,t,r,Ve);if(He.weight>0){let e=A[1]/Math.max(1e-4,A[2]),t=e>1?Math.min(Rn,e*e):1,n=1/Math.max(.5,1+Qt*Gn($t,en,g-h)*(He.z-M)),r=Math.min(mn,Math.max(1,(He.mean[1]/Math.max(1e-5,He.mean[0]))**+n)),i=Math.min(t,Math.max(hn,(Ln*He.mean[1]/Math.max(1e-5,He.mean[2]))**+n)),a=(e,t)=>Math.exp(Math.log(e)+(Math.log(t)-Math.log(e))*He.weight);I[0]=a(I[0],r),I[2]=a(I[2],i)}for(let e=0;e<6&&!(qn(ke,je,a,I)<=.015);e++)I[0]=Math.max(1,I[0]*.9);{let e=0;for(let t=0;t<a;t++)e+=Ae[t];let t=_n.strength*(_n.objHi>0?Gn(_n.objLo,_n.objHi,e/a):1);I[0]**=+t,I[2]=Math.max(Math.min(1,_n.bMin),I[2]**+t)}let Ue=Gn($t,en,g-h),We=[Qt*Ue*Math.log(I[0]),0,Qt*Ue*Math.log(I[2])];for(let e=0;e<a;e++){let t=v[e]-M;for(let n=0;n<3;n++)ke[e*3+n]*=Math.min(tn,Math.max(1/tn,Math.exp(We[n]*t)))}let Ge=e=>Math.min(pn,Math.max(1/pn,e**.6)),R=[Ge(I[0]),1,Ge(I[2])];if(R[2]<1&&(R[2]+=(1-R[2])*Se*Gn(1,1.25,A[2]/Math.max(1e-4,A[1]))),ze>0)for(let e of[0,2])R[e]=Math.exp(Math.log(R[e])+(Math.log(I[e])-Math.log(R[e]))*ze*P.greenWater);let Ke=X(`waterLin`,a*3);for(let e=0;e<a;e++){Ae[e];for(let t=0;t<3;t++)ke[e*3+t]=ke[e*3+t]*I[t],Ke[e*3+t]=o[e*3+t]*R[t]}let qe=X(`Y`,a),Je=(e,t,n)=>{let r=Ae[e],i=e*3,a=Ke[i]*n,o=Ke[i+1]*n,s=Ke[i+2]*n,c=(a+(ke[i]*t-a)*r)*.2126;return c+=(o+(ke[i+1]*t-o)*r)*.7152,c+=(s+(ke[i+2]*t-s)*r)*.0722,c=Math.max(c,Kn(S[e])*S[e]*n),c>Cn?Cn+(1-Cn)*(1-Math.exp(-(c-Cn)/(1-Cn))):c},Ye=0,Xe=0,Ze=0;for(let e=0;e<a;e++){let t=Je(e,1,1);Ye+=Ae[e]*Math.log(1e-4+t),Xe+=Ae[e],Ze+=Ae[e]}let z=Gn(.02,.15,Ze/a),Qe=Xe>1e-6?Math.exp(Ye/Xe):vn,B=Math.min(1.35,Math.max(.75,vn/Math.max(1e-4,Qe)));B=1+(B-1)*z;{let e=B**+fn;for(let t=0;t<a;t++)qe[t]=Je(t,B,e)}let[V]=Zn(qe,[.995]);if(V>yn){B=Math.max(.6,yn/V*B);let e=B**+fn;for(let t=0;t<a;t++)qe[t]=Je(t,B,e)}let[$e,et,nt]=Zn(qe,[.004,.1,.5]),at=Math.min($e,kn.low*et,kn.mid*nt)*(1-Tn.lift*Pe),ot=[0,0,0];{let e=B**+fn,t=X(`hazeCh`,a);for(let n=0;n<3;n++){for(let r=0;r<a;r++){let i=Ke[r*3+n]*e;t[r]=i+(ke[r*3+n]*B-i)*Ae[r]}ot[n]=Zn(t,[.004])[0]}}if(at<$e)for(let e=0;e<3;e++)ot[e]*=at/$e;{let e=Wt.lift*Bt(Vn($e/On))*at;if(e>0)for(let t=0;t<a;t++)qe[t]*=lt(qe[t],e)}let[st,ct]=Zn(qe,[.004,.996]),ut=Math.min(st,.015),dt=Math.min(1,Math.max(ct,ut+.2,.65)),ft=X(`enc`,a);for(let e=0;e<a;e++){let t=qe[e];ft[e]=Nn(Vn(t+((t-ut)/(dt-ut)-t)*bn))}let U=rr(ft,t,r),W=1;if(xn.strength>0){let e=Math.cbrt(Math.max(1e-4,te[Math.round(255*Vn(Zn(ft,[.5])[0]))]));e>xn.target&&e<.98&&(W=1+(Math.min(xn.max,Math.log(xn.target)/Math.log(e))-1)*xn.strength)}let G=Ae,pt=0,K,mt,ht;if(Se>0){let e=X(`subjMap`,a),o=X(`notAnimal`,a);o.fill(0,0,a);let s=X(`subjSmall`,a);pt=b(_e,be,Se,t,r,e,de,F,ge,i.seeds,fe,he,o,mt=[],s),G=X(`confMap`,a);for(let t=0;t<a;t++)G[t]=Ae[t]+(e[t]-Ae[t])*Se;let c=e;for(let t=0;t<a;t++)if(s[t]>e[t]){c=X(`subjAll`,a);break}if(c!==e){ht=X(`confPop`,a);for(let t=0;t<a;t++)c[t]=Math.max(e[t],s[t]),ht[t]=Ae[t]+(c[t]-Ae[t])*Se}K=n(c,be,t,r,160,90,o)}let q=tr(v,G,p,we,o,t,r);ht&&(q.popConf=nr(ht,t,r)),K&&(q.animals=K),mt&&(q.blobs=mt);let gt=Vn($e/On),_t=pe(o,a),{calm:vt,calmTone:yt}=me(_t,gt),bt=0,St=0,Ct=0,Tt=0;for(let e=0;e<r;e++){let n=e<r/3?1:e>=2*r/3?2:0;if(n)for(let r=0;r<t;r++){let i=de[e*t+r];i<.02||(n===1?(bt+=i,St++):(Ct+=i,Tt++))}}let Et=E(ae[0],ae[1],ae[2]),Dt=St>0&&Tt>0?Ct/Tt-bt/St:0,Ot=xt(Et[0],Math.hypot(Et[1],Et[2]),Dt),kt=wt(Et[0],Math.hypot(Et[1],Et[2]),Dt),At=0,jt=1,Mt=0;{let e=Float32Array.from(de).sort();At=e[Math.floor(.25*(a-1))],jt=e[Math.floor(.97*(a-1))];let t=e[Math.floor(.8*(a-1))],n=0,r=0;for(let e=0;e<a;e++)de[e]>=t&&(n+=o[e*3],r+=o[e*3+1]);Mt=1-Gn(H.redLo,H.redHi,n/Math.max(1e-5,r));let i=St>0&&Tt>0?Ct/Tt-bt/St:0;Mt*=Gn(H.bandLo,H.bandHi,i)}let Nt=Qn(de,t,r,At,jt);return{params:{toneGamma:W,seabedNeed:Mt,seabedLw:At,seabedLb:jt,seabedGrid:Nt,binf:A,betaB:ie,cB:j,attn:We,gainCap:tn,zMean:M,wb:I,waterWb:R,confLo:nn,confHi:rn,veilColor:D,cosLo:an,cosHi:on,hueFarLo:cn,hueFarHi:ln,haze:gt,hazeBlack:at,frameBlack:at,hazeFloor:ot,achroma:sn,waterExposure:fn,exposure:B,black:ut,white:dt,levelsMix:bn,chromaK:2.6,chromaC0:.025,zLo:h,zHi:g,depthGuide:Dn,floorFrac:wn,shadowFloor:En,knee:Cn,subLo:De,subHi:Oe,calm:vt,calmTone:yt,backdrop:Se,backdropFit:Array.from(F),subjectTone:pt,vividGate:Ot,blueGate:kt},depth:q,clahe:U,mean:f,diag:{sandWeight:He.weight,sandFrac:He.frac,sandMask:Ve,calm:_t,backdrop:Se,tone:{black:$e,yLow:et,yMid:nt,veilCap:Pe}}}}const Fn=75*Math.PI/180,In=Math.cos(Fn),Ln=.94,Rn=1.8;function zn(e,t,n,r,i,a,o,s,c){let l=o*s,u=X(`sandSq`,l);for(let e=0;e<l;e++)u[e]=a[e]*a[e];let d=$n(a,o,s,2,X(`sandM`,l),X(`blurT`,l)),f=$n(u,o,s,2,X(`sandS`,l),X(`blurT`,l)),p=X(`sandCand`,l),m=0;for(let e=0;e<l;e++){if(p[e]=-1,t[e]<.5||n[e]<.3||a[e]<.12)continue;let o=Math.sqrt(Math.max(0,f[e]-d[e]*d[e]));if(o>.22*d[e]||o<.045*d[e])continue;let s=r[e];s>.13||s>.03&&i[e]<In||(p[e]=a[e],m++)}let h=m/l,g=.95*Gn(.05,.15,h),_=[0,0,0];if(g<=0)return{weight:0,frac:h,mean:_,z:0};let[v]=Zn(p,[1-.30000000000000004*h]),y=0,b=[0,0,0],x=0;for(let t=0;t<l;t++)p[t]<v||(x+=e(t,b),_[0]+=b[0],_[1]+=b[1],_[2]+=b[2],y++);if(y===0)return{weight:0,frac:h,mean:_,z:0};_[0]/=y,_[1]/=y,_[2]/=y;for(let e=0;e<l;e++)c[e]=+(p[e]>=v);return{weight:g,frac:h,mean:_,z:x/y}}function Bn(e,t){return w(e[t*3],e[t*3+1],e[t*3+2])}function Vn(e){return e<0?0:e>1?1:e}function Hn(e,t,n,r,i,a){let o=Array.from({length:144},()=>[]);for(let a=0;a<i;a++){let s=Math.min(8,Math.floor(a*9/i));for(let i=0;i<r;i++){let c=a*r+i;if(t[c]>.5)continue;let l=n[c*3]*.2126;if(l+=n[c*3+1]*.7152,l+=n[c*3+2]*.0722,l<.001)continue;let u=w(e[c*3],e[c*3+1],e[c*3+2]),d=Math.min(15,Math.floor(i*16/r));o[s*16+d].push(u/l)}}let s=new Float32Array(144).fill(NaN);for(let e=0;e<144;e++){let t=o[e];t.length<6||(t.sort((e,t)=>e-t),s[e]=Math.min(2.2,Math.max(.6,t[t.length>>1])))}for(let e=0;e<8;e++){let e=!1,t=new Float32Array(s);for(let n=0;n<9;n++)for(let r=0;r<16;r++){let i=n*16+r;if(!Number.isNaN(s[i]))continue;let a=0,o=0;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++){let i=r+t,c=n+e;if(i<0||c<0||i>=16||c>=9)continue;let l=s[c*16+i];Number.isNaN(l)||(a+=l,o++)}o>0&&(t[i]=a/o,e=!0)}if(s.set(t),!e)break}for(let e=0;e<144;e++)Number.isNaN(s[e])&&(s[e]=1);for(let e=0;e<i;e++){let t=Math.min(Math.max((e+.5)*9/i-.5,0),8),n=Math.floor(t),o=Math.min(n+1,8),c=t-n;for(let t=0;t<r;t++){let i=Math.min(Math.max((t+.5)*16/r-.5,0),15),l=Math.floor(i),u=Math.min(l+1,15),d=i-l,f=s[n*16+l]*(1-d)+s[n*16+u]*d,p=s[o*16+l]*(1-d)+s[o*16+u]*d;a[e*r+t]=f*(1-c)+p*c}}return a}function Un(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 1;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o)),c=Gn(r,i,Math.acos(s)),l=Gn(a,a*2,o);return c+(1-c)*(1-l)}function Wn(e,t,n,r,i,a){let o=Math.hypot(e,t);if(o<a)return 0;let s=Math.max(-1,Math.min(1,(e*n[0]+t*n[1])/o));return Gn(r,i,Math.acos(s))*Gn(a,a*2,o)}function Gn(e,t,n){let r=Vn((n-e)/(t-e));return r*r*(3-2*r)}function Kn(e,t=En){return .97+(t-.97)*Gn(.02,.15,e)}function qn(e,t,n,r){let i=0,a=0;for(let o=0;o<n;o+=2){if(t[o]<.5)continue;let[n,s,c]=E(e[o*3]*r[0],e[o*3+1]*r[1],e[o*3+2]*r[2]);if(n<.25||n>.9||Math.hypot(s,c)<.06)continue;i++;let l=O(s,c);l>300&&l<348&&a++}return i<20?0:a/i}const Jn=[.3,.45,.65,.9,1.3,1.8,2.5,3.5,5,7],Yn=[0,.1,.2,.35,.5,.7,1,1.5];function Xn(e,t){let n=[{A:0,beta:1,c:0},{A:0,beta:1,c:0},{A:0,beta:1,c:0}];if(e.length<12)return n;let r=Math.max(1,Math.ceil(e.length/400)),i=[],a=[[],[],[]];for(let n=0;n<e.length;n+=r){i.push(e[n]);for(let e=0;e<3;e++)a[e].push(t[e][n])}let o=i.length,s=new Float32Array(o),c=[{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0},{A:0,beta:1,c:0,err:1/0}];for(let e of Jn)for(let t of Yn){let n=0;for(let r=0;r<o;r++){let a=1-Math.exp(-(e*i[r]+t));s[r]=a,n+=a*a}let r=1+.05*t;for(let i=0;i<3;i++){let l=a[i],u=0,d=0;for(let e=0;e<o;e++)u+=s[e]*l[e],d+=l[e]*l[e];let f=n>1e-9?Math.min(1,Math.max(0,u/n)):0,p=(f*f*n-2*f*u+d)*r;p<c[i].err&&(c[i]={A:f,beta:e,c:t,err:p})}}let l=(e,t)=>e.A*(1-Math.exp(-(e.beta*t+e.c))),u=1;for(let e of[.1,.3,.6,1]){let t=l(c[0],e),n=.85*Math.min(l(c[1],e),l(c[2],e));t>n&&(u=Math.min(u,t>1e-6?n/t:0))}return c[0].A*=Math.max(0,u),c.map(e=>({A:e.A,beta:e.beta,c:e.c}))}function Zn(e,t){let n=1/0,r=-1/0;for(let t=0;t<e.length;t++){let i=e[t];i<n&&(n=i),i>r&&(r=i)}if(!(r>n))return t.map(()=>n);let i=2048,a=new Uint32Array(i),o=(i-1)/(r-n);for(let t=0;t<e.length;t++)a[(e[t]-n)*o|0]++;let s=[];for(let r of t){let t=r*e.length,c=0,l=0;for(;l<i&&(c+=a[l],!(c>=t));l++);s.push(n+Math.min(l,i-1)/o)}return s}function Qn(e,t,n,r,i){let a=H.grid,o=Array(a*a).fill(0),s=Array(a*a).fill(0),c=Math.max(i,r+.05),l=r+H.lo*(c-r),u=r+(H.lo+H.span)*(c-r);for(let r=0;r<n;r++){let i=Math.min(a-1,Math.floor(r*a/n));for(let n=0;n<t;n++){let c=i*a+Math.min(a-1,Math.floor(n*a/t));o[c]+=Gn(l,u,e[r*t+n]),s[c]++}}return o.map((e,t)=>s[t]>0?e/s[t]:0)}function $n(e,t,n,r,i=new Float32Array(t*n),a=new Float32Array(t*n)){let o=2*r+1;for(let i=0;i<n;i++){let n=0;for(let a=-r;a<=r;a++)n+=e[i*t+er(a,t)];for(let s=0;s<t;s++)a[i*t+s]=n/o,n+=e[i*t+er(s+r+1,t)]-e[i*t+er(s-r,t)]}for(let e=0;e<t;e++){let s=0;for(let i=-r;i<=r;i++)s+=a[er(i,n)*t+e];for(let c=0;c<n;c++)i[c*t+e]=s/o,s+=a[er(c+r+1,n)*t+e]-a[er(c-r,n)*t+e]}return i}function er(e,t){return e<0?0:e>=t?t-1:e}function tr(e,t,n,r,i,a,o){let s=$n(e,a,o,1),c=$n($n(t,a,o,1),a,o,1),l=new Float32Array(14400*4),u=new Float32Array(14400*3);for(let e=0;e<90;e++){let t=Math.floor(e*o/90),d=Math.max(t+1,Math.floor((e+1)*o/90));for(let o=0;o<160;o++){let f=Math.floor(o*a/160),p=Math.max(f+1,Math.floor((o+1)*a/160)),m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;for(let e=t;e<d;e++)for(let t=f;t<p;t++){let o=e*a+t;m+=s[o],h+=c[o],g+=n[o],_+=r[o],v+=i[o*3],y+=i[o*3+1],b+=i[o*3+2],x++}let S=e*160+o;l[S*4]=m/x,l[S*4+1]=h/x,l[S*4+2]=g/x,l[S*4+3]=_/x,u[S*3]=v/x,u[S*3+1]=y/x,u[S*3+2]=b/x}}return{width:160,height:90,fields:l,guide:u}}function nr(e,t,n){let r=$n($n(e,t,n,1),t,n,1),i=new Float32Array(14400);for(let e=0;e<90;e++){let a=Math.floor(e*n/90),o=Math.max(a+1,Math.floor((e+1)*n/90));for(let n=0;n<160;n++){let s=Math.floor(n*t/160),c=Math.max(s+1,Math.floor((n+1)*t/160)),l=0,u=0;for(let e=a;e<o;e++)for(let n=s;n<c;n++)l+=r[e*t+n],u++;i[e*160+n]=l/u}}return i}function rr(e,t,n){let r=new Float32Array(1536),i=new Float32Array(32);for(let a=0;a<6;a++){let o=Math.floor(a*n/6),s=Math.floor((a+1)*n/6);for(let n=0;n<8;n++){let c=Math.floor(n*t/8),l=Math.floor((n+1)*t/8);i.fill(0);let u=0,d=0,f=0;for(let n=o;n<s;n++)for(let r=c;r<l;r++){let a=e[n*t+r];i[Math.min(31,a*32|0)]++,d+=a,f+=a*a,u++}let p=.5;for(let e=0,t=0;e<32;e++){if(t+i[e]>=u/2&&i[e]>0){p=(e+(u/2-t)/i[e])/32;break}t+=i[e]}let m=Sn.clip*u/32,h=0;for(let e=0;e<32;e++)i[e]>m&&(h+=i[e]-m,i[e]=m);let g=h/32,_=(a*8+n)*32;if(u===0){for(let e=0;e<32;e++)r[_+e]=(e+1)/32;continue}let v=d/u,y=Gn(Sn.sigLo,Sn.sigHi,Math.sqrt(Math.max(0,f/u-v*v))),b=0,x=p;{let e=Math.min(31,p*32|0),t=0;for(let n=0;n<e;n++)t+=i[n]+g;x=(t+(i[e]+g)*(p*32-e))/u}let S=Sn.anchor*(x-p);for(let e=0;e<32;e++){b+=i[e]+g;let t=(e+1)/32;r[_+e]=Vn(t+y*(b/u-t-S))}}}return{tilesX:8,tilesY:6,bins:32,data:r}}const Z={popLo:.2,popHi:.6,alphaR:6,rampIn:2.5,trustLo:2,trustHi:4.5,evLo:.025,evHi:.07,evFar:.4,rampEv:1,thinLevels:4,jbuK:.5,jbuNoise:.02,jbuLo:.46,jbuHi:.72};function ir(e,t,n){let r=Math.min(n,...t),i=Math.max(n,...t),a=1/Math.max(Z.jbuNoise,Z.jbuK*(i-r));return e.map((e,r)=>e*Math.exp(-(((t[r]-n)*a)**2)))}const ar=`
const float CONF_BRIGHT_LO = ${it.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${it.hi.toFixed(4)};
const float PERSON_LUM_LO = ${at.lo.toFixed(4)};
const float PERSON_LUM_HI = ${at.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${ot.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${ot.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${st.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${st.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${st.farKeep.toFixed(4)};
const float VIVID_C_LO = ${ht.cLo.toFixed(4)};
const float VIVID_C_HI = ${ht.cHi.toFixed(4)};
const float VIVID_KEEP = ${ht.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${ne.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${k.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${re.toFixed(4)};
const float LOOK_GAMMA = ${q.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${q.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${q.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${q.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${q.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${q.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${q.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${q.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${q.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${q.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${q.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${q.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${q.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${q.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${q.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${q.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${q.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${q.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${q.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${q.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${q.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${q.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${q.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${q.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${q.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${q.keepHi.toFixed(4)};
const float LOOK_C0 = ${q.c0.toFixed(4)};
const float LOOK_C1 = ${q.c1.toFixed(4)};
const float LOOK_MIX = ${q.mix.toFixed(4)};
const float SKIN_HUE = ${J.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${J.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${J.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${J.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${J.achroma.toFixed(4)};
const float SKIN_L_LO = ${J.lLo.toFixed(4)};
const float SKIN_L_HI = ${J.lHi.toFixed(4)};
const float SKIN_C_LO = ${J.cLo.toFixed(4)};
const float SKIN_C_HI = ${J.cHi.toFixed(4)};
const float SKIN_MIX = ${J.mix.toFixed(4)};
const float SKIN_W_LO = ${J.wLo.toFixed(4)};
const float SKIN_W_HI = ${J.wHi.toFixed(4)};
const float SKIN_C_MIN = ${J.cMin.toFixed(4)};
const float DG_K = ${ut.k.toFixed(4)};
const float DG_EPS = ${ut.eps.toFixed(5)};
const float DG_R_MIN = ${ut.rMin.toFixed(4)};
const float DG_R_MAX = ${ut.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(K.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(K.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(K.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(K.bandIn).toFixed(6)};
const float ON_R_LO = ${K.rLo.toFixed(4)};
const float ON_R_HI = ${K.rHi.toFixed(4)};
const float ON_L_LO = ${K.lLo.toFixed(4)};
const float ON_L_HI = ${K.lHi.toFixed(4)};
const float ON_MIX = ${K.mix.toFixed(4)};
const float ON_FAR_LO = ${K.farLo.toFixed(6)};
const float ON_FAR_HI = ${K.farHi.toFixed(6)};
const float ON_LIFT = ${K.lift.toFixed(4)};
const float ON_SILVER = ${K.silver.toFixed(4)};
const float SC_K = ${ft.k.toFixed(4)};
const float SC_CMAX = ${ft.cMax.toFixed(4)};
const float SC_DESAT = ${ft.desat.toFixed(4)};
const float SC_EDGE = ${ft.edgeFloor.toFixed(4)};
const float SP_VIVID = ${W.vividKeep.toFixed(4)};
const float SP_CLARITY = ${W.clarity.toFixed(4)};
const float SP_LIFT = ${W.lift.toFixed(4)};
const float WP_HUE = ${U.hue.toFixed(4)};
const float SB_HUE = ${H.hue.toFixed(4)};
const float SB_CHROMA = ${H.chroma.toFixed(4)};
const float SB_KEEP = ${H.keep.toFixed(4)};
const float SB_LIFT = ${H.lift.toFixed(4)};
const float SB_GRID = ${H.grid.toFixed(1)};
const float SB_W_LO = ${H.wLo.toFixed(4)};
const float SB_W_HI = ${H.wHi.toFixed(4)};
const float SB_Y0 = ${H.y0.toFixed(4)};
const float SB_Y1 = ${H.y1.toFixed(4)};
const float WP_CMIN = ${U.cMin.toFixed(4)};
const float WP_CMAX = ${U.cMax.toFixed(4)};
const float WP_KEEP = ${U.keep.toFixed(4)};
const float WP_LLO = ${U.lLo.toFixed(4)};
const float WP_LHI = ${U.lHi.toFixed(4)};
const float WP_WLO = ${U.wLo.toFixed(4)};
const float WP_WHI = ${U.wHi.toFixed(4)};
const float WP_SIDE = ${U.side.toFixed(4)};
const float WP_CAST_LO = ${U.castLo.toFixed(4)};
const float WP_CAST_HI = ${U.castHi.toFixed(4)};
const float SP_CHROMA = ${W.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${W.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${W.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${W.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${W.chromaFollowDark.toFixed(4)};
const float SP_DARK_LO = ${W.darkLo.toFixed(4)};
const float SP_DARK_HI = ${W.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(W.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(W.hueMax).toFixed(6)};
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
const float ON_CONF_LO = ${K.confLo.toFixed(4)};
const float ON_CONF_HI = ${K.confHi.toFixed(4)};
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
const float SR_DARK_LO = ${G.darkLo.toFixed(4)};
const float SR_DARK_HI = ${G.darkHi.toFixed(4)};
const float SR_POP_GATE = ${G.popGate.toFixed(4)};
const float SR_CAST = ${G.cast.toFixed(4)};
const float SR_CAST_MAX = ${G.castMax.toFixed(4)};
const float SR_COS = ${Math.cos(G.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(G.hue).toFixed(6)};
const float SR_WARM = ${G.warm.toFixed(4)};
const float SR_WARM_SHARE = ${G.warmShare.toFixed(4)};
const float SR_FAR_KEEP = ${G.farKeep.toFixed(4)};
const float SR_EDGE = ${G.edge.toFixed(4)};
const float SEG_PACK = ${G.pack.toFixed(4)};
const float SEG_LEVELS = ${G.levels.toFixed(4)};
const float SR_LIT_LO = ${G.litLo.toFixed(4)};
const float SR_LIT_HI = ${G.litHi.toFixed(4)};
const float SR_HI_LO = ${G.hiLo.toFixed(4)};
const float SR_HI_HI = ${G.hiHi.toFixed(4)};
const float SR_DETAIL = ${G.detail.toFixed(4)};
const float SR_R_MIN = ${G.rMin.toFixed(4)};
const float SR_R_MAX = ${G.rMax.toFixed(4)};
const float SR_LIFT = ${G.lift.toFixed(4)};
const float SR_X_WARM = ${G.boostWarm.toFixed(4)};
const float SR_X_WARM_SHARE = ${G.boostWarmShare.toFixed(4)};
const float SR_X_DETAIL = ${G.boostDetail.toFixed(4)};
const float SR_X_LIFT = ${G.boostLift.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(K.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(K.warmHue).toFixed(6)};
const float ON_WARM_LO = ${K.warmLo.toFixed(4)};
const float ON_WARM_HI = ${K.warmHi.toFixed(4)};
${Object.entries(gt).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(_t).map(([e,t])=>`const float BW_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(Ot).map(([e,t])=>`const float RL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(vt).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
const float TONE_TOE_LO = ${Tt.lo.toFixed(6)};
const float TONE_TOE_HI = ${Tt.hi.toFixed(6)};
`,or=ar.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`);`${ar}${$e()}${Ie}`,`${or}${et()}${Le}`;const sr=dt.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),cr=dt.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),lr=`
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
${sr}
  return acc / sw;
}`,ur=`
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
${cr}
  return acc.xyz / acc.w;
}`,dr=e=>e.replaceAll(`dgTap`,`dgTapNr`).replaceAll(`detailBase`,`detailBaseNr`).replaceAll(`u_source`,`u_tpNr`);dr(lr),dr(ur);function fr(e){let t=Math.floor((e+8)/G.pack),n=Math.floor((t+.5)/(G.levels+1));return[e-G.pack*t,(t-(G.levels+1)*n)/G.levels,n/Z.thinLevels]}const pr=new WeakMap;function mr(e){if(!e.popConf)return e;let t=pr.get(e);return t||(t={...e,fields:Y(new Float32Array(e.fields),e.popConf)},pr.set(e,t)),t}function hr(e){let t=e.settings.subjectPop&&e.depth.popConf?{...e,depth:mr(e.depth)}:e,n=t.settings.hazeAuto!==!1,r=jt(Ut((n?Kt:e=>e)(Vt(Jt(he(t.params),It(t.settings)),t.settings)),t.settings),t.settings),i=we(Ht(ge(Lt(t.settings),r),t.settings),r);return{...t,params:r,settings:{...qt(n?Gt(i,r):i,r),vivid:St(r,t.settings),blue:Pt(r,t.settings)},seabed:gr(r,t.settings),waterTint:Nt(t.settings),fitLook:Ke(r,t.settings),fitLookGate:qe(r,t.settings),fitLookMix:Je(t.settings)}}function gr(e,t){return Mr(t.seabed??0,0,1)*Mr(e.seabedNeed??0,0,1)*(1-Mr(e.backdrop??0,0,1))}function _r(e,t,n){let r=H.grid,i=e.seabedGrid;if(!i||i.length!==r*r)return 0;let a=t*r-.5,o=n*r-.5,s=Math.floor(a+.5),c=Math.floor(o+.5),l=a-s,u=o-c,d=[.5*(.5-l)*(.5-l),.75-l*l,.5*(.5+l)*(.5+l)],f=[.5*(.5-u)*(.5-u),.75-u*u,.5*(.5+u)*(.5+u)],p=0;for(let e=0;e<3;e++)for(let t=0;t<3;t++)p+=d[t]*f[e]*i[Mr(c+e-1,0,r-1)*r+Mr(s+t-1,0,r-1)];return Q(H.wLo,H.wHi,p)*Q(H.y0,H.y1,n)}const vr=.12;function yr(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=0,b=0,x=0,S=0,C=0,ee=0,te=0,w=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of w){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*vr*vr)),p=s*4,w=e.person?e.person[s]:0;h+=f*e.fields[p],g+=f*e.fields[p+1],_+=f*e.fields[p+2],v+=f*e.fields[p+3],b+=f*w,y+=f,x+=o*e.fields[p],S+=o*e.fields[p+1],C+=o*e.fields[p+2],ee+=o*e.fields[p+3],te+=o*w}let T=Math.min(1,y/.08);return y<1e-6?[x,S,C,ee,0,te]:[h/y,g/y,_/y,v/y,T,b/y]}function br(e,t,n,r){let i=r*e.bins-1,a=t=>{let n=t*e.bins;if(i<0)return e.data[n]*(i+1);let r=Math.min(e.bins-1,Math.floor(i)),a=Math.min(e.bins-1,r+1),o=Math.min(1,Math.max(0,i-r));return e.data[n+r]+(e.data[n+a]-e.data[n+r])*o},o=Math.min(Math.max(t*e.tilesX-.5,0),e.tilesX-1),s=Math.min(Math.max(n*e.tilesY-.5,0),e.tilesY-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.tilesX-1),d=Math.min(l+1,e.tilesY-1),f=o-c,p=s-l,m=a(l*e.tilesX+c)*(1-f)+a(l*e.tilesX+u)*f,h=a(d*e.tilesX+c)*(1-f)+a(d*e.tilesX+u)*f;return m*(1-p)+h*p}function xr(e,t,n,r,i,a,o,s=0){let{params:l,settings:u}=e,d=o?o[0]:t,f=o?o[1]:n,p=o?o[2]:r,m=C(d),h=C(f),v=C(p),y=tt.mu0+tt.mu1*Math.max(f,p)+tt.mu2*d,[b,x,S,te,T,D]=yr(e.depth,i,a,m,h,v),O=Mr(D,0,1),ne=Math.max(.02,l.zHi-l.zLo),k=Mr((y-l.zLo)/ne,0,1.15),re=k+(Mr(b+Mr(l.depthGuide*(y-S)/ne,-.25,.25),0,1.15)-k)*T,A=1+(te-1)*T,ie=[m,h,v],j=Math.max(1e-5,w(m,h,v)),ae=[0,0,0],oe=[0,0,0],M=0,se=0,ce=Math.min(1,A);for(let e=0;e<3;e++){let t=u.veil*l.binf[e]*(1-Math.exp(-(l.betaB[e]*re+l.cB[e])));ae[e]=A*t,oe[e]=ce*t;let n=e===0?.2126:e===1?.7152:.0722;M+=ae[e]*n,se+=oe[e]*n}let le=Math.max(0,(j-M)/j),ue=E(m,h,v),de=ue[1],fe=ue[2],pe=Q(l.subLo,l.subHi,le)*(1-Gr(de,fe,l))*(1-P.greenProp*Ce(l)),me=Math.max(l.floorFrac,1-se/j),he=[0,1,2].map(e=>Math.min(l.gainCap,Math.max(1/l.gainCap,Math.exp(l.attn[e]*(re-l.zMean))))),ge=Oe(ie,Ee(e.depth,i,a,m,h,v),he.map((e,t)=>Math.max(e*l.wb[t],l.waterWb[t])),ae),N=ge.c,_e=Me(ge.snrR),F=ke(l.waterWb[0],he[0]*l.wb[0],ge.snrR),ve=[0,0,0];for(let e=0;e<3;e++){let t=N[e],n=Math.max(t-oe[e],t*l.floorFrac),r=t*me+(n-t*me)*pe,i=he[e]*l.wb[e];ve[e]=r*(e===0?1+(i-1)*_e:i)}let ye=Q(l.confLo,l.confHi,le),be=Q(it.lo,it.hi,le),xe=mt(l),Se=l.backdropFit,we=xe>0&&Se&&Se.length===18?g(ue[0],de,fe,i,a,Se):1,De=Math.min(ye,Math.max(qr(de,fe,l)*(1+(we-1)*xe),be,Ce(l)*P.greenObj)),Pe=O*Q(at.lo,at.hi,j),Fe=1+(we-1)*xe,Ie=Math.max(Math.min(Mr(x,0,1),Fe)*T+De*(1-T),Pe)*ye*(1-xe*Lr(m,h,v)),Le=e.settings.subjectPop?Mr(l.subjectTone??0,0,1):0,Re=xe>0&&Se&&Se.length===18?_(ue[0],de,fe,i,a,Se):1,I=xe>0&&Se&&Se.length===18?Math.max(Xr(e.depth,i,a,Mr(x,0,1)*T,Re),s*Q(c.subjLo,c.subjHi,Re)):0,[ze,Be]=$r(e.depth,i,a),L=e.seg&&e.settings.subjectPop?Tr(e.seg.strength,i,a,e.seg.guide):null,Ve=e.settings.subjectPop?pt(e.settings):0,[,He,Ue]=E(l.veilColor[0],l.veilColor[1],l.veilColor[2]),We=Math.hypot(He,Ue)||1,Ge=Math.max(I,xe>0?Be*Q(c.holdLo,c.holdHi,Re):0)*xe*Le*ze;if(e.debug)return[T,De,Mr(x,0,1)];let R=[0,0,0],Ke=l.exposure**+l.waterExposure,qe=1-u.dehaze*Math.min(.9,se/j)*Q(ot.lo,ot.hi,j);for(let e=0;e<3;e++){let t=N[e]*(e===0?F:l.waterWb[e])*Ke*qe;R[e]=t+(ve[e]*l.exposure-t)*Ie}let Je=ct(l,u.hazeLift),Ye=1;if(Je[0]+Je[1]+Je[2]>0){let e=w(R[0],R[1],R[2]),t=Gr(de,fe,l),n=lt(e,u.hazeLift*l.hazeBlack*(1-st.farKeep));for(let e=0;e<3;e++)R[e]*=lt(R[e],Je[e])+(n-lt(R[e],Je[e]))*t;Ye=e>1e-6?w(R[0],R[1],R[2])/e:1}let z=w(R[0],R[1],R[2]),Qe=z+((z-l.black)/(l.white-l.black)-z)*l.levelsMix,B=z>1e-5?Math.max(0,Qe)/z:1;for(let e=0;e<3;e++)R[e]*=B;z=Math.max(0,Qe);let V=Math.cbrt(Math.max(0,z)),$e=L?Dr(L,ue,He/We,Ue/We,Le,Ve):0,et=(L?$e:W.engineKeep*Fr(Ge)*(ft.edgeFloor+(1-ft.edgeFloor)*Q(c.subjLo,c.subjHi,Re)))*Q(W.darkLo,W.darkHi,V),nt=Math.max(mt(l),L?Er(L[3]):0),rt=et*nt*Ve,dt=L?$e*Q(G.darkLo,G.darkHi,V)*Ve:0;if(u.clarity>0){let t=ee(Mr(z,0,1)),n=C(Mr(t+(br(e.clahe,i,a,t)-t)*(u.clarity+W.clarity*rt),0,1));B=z>1e-5?n/z:1;for(let e=0;e<3;e++)R[e]*=B}{let e=w(R[0],R[1],R[2]),t=Kn(j,l.shadowFloor)*j*Ke*Ye,n=Math.max(e,t);if(n=je(n,j,Ce(l)*(1-Ie)),n>l.knee&&(n=l.knee+(1-l.knee)*(1-Math.exp(-(n-l.knee)/(1-l.knee)))),e>1e-6){if(n!==e){let t=n/e;R[0]*=t,R[1]*=t,R[2]*=t}}else{let e=n/j;R[0]=ie[0]*e,R[1]=ie[1]*e,R[2]=ie[2]*e}}let[,q,gt]=E(m,h,v),_t=Math.hypot(q,gt),vt=E(Math.max(0,R[0]),Math.max(0,R[1]),Math.max(0,R[2])),yt=vt[0],bt=vt[1],xt=vt[2],St=Math.hypot(bt,xt),Ct=l.chromaK*_t+l.chromaC0,wt=St>Ct?Ct/St:1,Tt=Q(ht.cLo,ht.cHi,_t)*Gr(q,gt,l),Dt=ht.keep*_t*Tt;St>1e-6&&St*wt<Dt&&(wt=Dt/St),wt*=u.saturation;let Ot=Kr(q,gt,l,K.farLo,K.farHi);[bt,xt]=Te(yt,bt,xt,Ce(l)*(1-P.gnObjKeep*Ie));let kt=Pr(yt,bt,xt,m,h,v,Ot,L?0:et,nt)*Q(W.keepDarkLo,W.keepDarkHi,yt),At=O*(1-mt(l)*Lr(m,h,v));wt*=Ir(bt,xt,m,h,v,Ot,At,L?mt(l):nt);let[jt,Mt]=Nr(bt*wt,xt*wt,He/We,Ue/We,kt/K.mix),Nt=Q(U.castLo,U.castHi,Math.hypot(bt,xt)*wt),Pt=yt,Ft=Rr(Pt,jt,Mt,At),It=zr(Pt,Ft[0],Ft[1],u.look,1-qr(de,fe,l),zt(l),Rt(l)),Lt=Ne(It[0],It[1],It[2],q,gt,O,Ot),Bt=Ae(It[0],Lt[0],Lt[1],Ce(l),Ot),Vt=Br(It[0],Bt[0],Bt[1],u.vivid??0,Ce(l)),Ht=rt>0&&!L?Br(It[0],Bt[0],Bt[1],(u.vivid??0)*(1-W.vividKeep*Math.min(1,rt)),Ce(l))[0]:Vt[0],Ut=L?e.seg.popDir??1:1,Wt=L?Ht:Ht+W.lift*rt*Ut*4*Ht*Math.max(0,1-Ht),Gt=1+(W.chromaFollowDark+(W.chromaFollow-W.chromaFollowDark)*Q(W.keepDarkLo,W.keepDarkHi,Ht))*(Wt/Math.max(1e-4,Ht)-1);Vt[0]=Wt,Vt[1]*=Gt,Vt[2]*=Gt;let Kt=Wr(Vt[0],Vt[1],Vt[2]),qt=wr(Kt[0],Kt[1],q,gt,Mr(et*nt,0,1)),Jt=Q(U.wLo,U.wHi,et)*(L?0:Q(c.subjLo,c.subjHi,Re))*(u.subjectPop?Math.min(1,Math.max(0,u.subjectPopWarmth??0)):0)*Nt,Yt=Cr(Vt[0],qt[0],qt[1],Jt),Y=Vr(Vt[0],Yt[0],Yt[1],u.blue??0,Ce(l));if([Y[1],Y[2]]=Hr(Y[1],Y[2],e.waterTint??0,Ce(l)),[Y[1],Y[2]]=Ur(Y[0],Y[1],Y[2],u.vivid??0),(e.seabed??0)>0){let t=_r(l,i,a)*(1-Tt)*e.seabed;Y[0]+=H.lift*t,Y[1]+=(Math.cos(H.hue)*H.chroma+H.keep*Y[1]-Y[1])*t,Y[2]+=(Math.sin(H.hue)*H.chroma+H.keep*Y[2]-Y[2])*t}if(dt>0){let t=(j+ut.eps)/(kr(e.depth,i,a)+ut.eps);[Y[0],Y[1],Y[2]]=jr(Y[0],Y[1],Y[2],dt,u.subjectPop?Math.min(1,Math.max(0,u.subjectPopWarmth??0)):0,t,0,Ar(L),Ve>1?dt*(1-1/Ve):0)}if((l.toneGamma??1)>1&&(Y[0]=Et(Y[0],l.toneGamma)),O>0){let t=1-Tt;[Y[1],Y[2]]=Ze(Y[0],Y[1],Y[2],Q(J.wLo,J.wHi,O)*t,Q(J.wLo,J.wHi,At)*t,Math.max(Xe(q,gt),Xe(...Or(e.depth,i,a)),mt(l)))}let Xt=o?Zr(t,n,r,m,h,v):1,Zt=Math.max(_t,Jt*U.cMin*1.5,Y[3]);e.lookTap&&e.lookTap(Y[0],Y[1],Y[2],Zt,Xt,u.strength,e.fitLookGate??0,e.fitLookMix??0);let[Qt,$t,en]=Sr(Y[0],Y[1],Y[2],Zt,Xt,e.fitLook??0,e.fitLookMix??0);if(e.trace){let t=e=>e.map(e=>+e.toFixed(3));Object.assign(e.trace,{subj:Ge,srcC:t(N),redS:+_e.toFixed(2),lin:t([m,h,v]),z:+re.toFixed(2),k:+T.toFixed(2),conf:+Ie.toFixed(2),veilScale:+A.toFixed(2),B:t(ae),sig:+le.toFixed(2),wSub:+pe.toFixed(2),full:t(ve),outPreLevels:t(R.map(e=>e)),Y:+z.toFixed(3),C:+St.toFixed(3),cMax:+Ct.toFixed(3),scale:+wt.toFixed(2),o2:t([Qt,$t,en])})}return[t+(Qt-t)*u.strength,n+($t-n)*u.strength,r+(en-r)*u.strength]}function Sr(e,t,n,r,i,a,o,s){let c=Ge(e,t,n,a,o,s),l=j(c[0],c[1],c[2],r),[u,d,f]=D(c[0],l[0],l[1]),[p,m,h]=ae(u*i,d*i,f*i);return[ee(p),ee(m),ee(h)]}function Cr(e,t,n,r){if(r<=0)return[t,n];let i=Math.min(U.cMax,Math.max(U.keep*Math.hypot(t,n),U.cMin*Q(U.lLo,U.lHi,e))),a=Math.cos(U.hue),o=Math.sin(U.hue),s=t*a+n*o,c=Math.max(0,1-r)**+U.side,l=s+(i-s)*r;return[a*l+(t-a*s)*c,o*l+(n-o*s)*c]}function wr(e,t,n,r,i){let a=Math.hypot(e,t),o=Math.hypot(n,r);if(i*=Q(.01,.04,o),i<=0||a<1e-4)return[e,t];let s=e/a,c=t/a,l=n/o,u=r/o,d=Math.cos(W.hueMax),f=Math.sin(W.hueMax);if(s*l+c*u>=d)return[e,t];let p=Math.sign(l*c-u*s),m=l*d-p*u*f,h=u*d+p*l*f,g=s+(m-s)*i,_=c+(h-c)*i,v=Math.hypot(g,_)||1;return[a*g/v,a*_/v]}function Tr(e,t,n,r){let i=Math.min(Math.max(t*e.width-.5,0),e.width-1),a=Math.min(Math.max(n*e.height-.5,0),e.height-1),o=Math.floor(i),s=Math.floor(a),c=Math.min(o+1,e.width-1),l=Math.min(s+1,e.height-1),u=i-o,d=a-s,f=[0,0,0,0,0,0],p=(e,t,n,r)=>(e+(t-e)*u)*(1-d)+(n+(r-n)*u)*d;for(let i=0;i<4;i++){let a=e.data[(s*e.width+o)*4+i],m=e.data[(s*e.width+c)*4+i],h=e.data[(l*e.width+o)*4+i],g=e.data[(l*e.width+c)*4+i];if(i===0){let e=fr(a),t=fr(m),n=fr(h),r=fr(g);f[0]=p(e[0],t[0],n[0],r[0]),f[4]=p(e[1],t[1],n[1],r[1]),f[5]=p(e[2],t[2],n[2],r[2])}else f[i]=p(a,m,h,g);if(i===2&&r){let i=Math.min(a,m,h,g),p=Math.max(a,m,h,g);if(p-i>1e-4&&i<Z.jbuHi&&p>Z.jbuLo){let i=r(t,n);if(i>=0){let t=(t,n)=>r((t+.5)/e.width,(n+.5)/e.height),n=ir([(1-u)*(1-d),u*(1-d),(1-u)*d,u*d],[t(o,s),t(c,s),t(o,l),t(c,l)],i),p=n[0]+n[1]+n[2]+n[3];p>1e-5&&(f[2]=(n[0]*a+n[1]*m+n[2]*h+n[3]*g)/p)}}}}return f}function Er(e){return e>0?Q(Z.popLo,Z.popHi,e):0}function Dr(e,t,n,r,i,a){if(e[3]<=0)return 0;let o=(e[2]-.5)*2*Z.alphaR,s=Z.evFar+(1-Z.evFar)*Mr(e[4]??1,0,1),c=e[0]>=0&&e[0]<=2,l=c?Q(Z.evLo*s,Z.evHi*s,Math.hypot(t[0]-e[0],t[1]*r-t[2]*n)):1,u=l+(1-l)*Q(Z.trustLo,Z.trustHi,o);return Q(0,c?Z.rampIn+(Z.rampEv-Z.rampIn)*l*Mr(e[5]??0,0,1):Z.rampIn,o)*u*Math.max(i,Er(e[3]))*e[1]*Math.min(1,G.popGate*a)}function Or(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=t=>{let n=(n,r)=>e.guide[(r*e.width+n)*3+t];return(n(a,o)+(n(s,o)-n(a,o))*l)*(1-u)+(n(a,c)+(n(s,c)-n(a,c))*l)*u},f=E(Math.max(0,d(0)),Math.max(0,d(1)),Math.max(0,d(2)));return[f[1],f[2]]}function kr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>{let r=(n*e.width+t)*3;return w(e.guide[r],e.guide[r+1],e.guide[r+2])};return(d(a,o)+(d(s,o)-d(a,o))*l)*(1-u)+(d(a,c)+(d(s,c)-d(a,c))*l)*u}function Ar(e){let t=(e[2]-.5)*2*Z.alphaR,n=Mr(e[4]??1,0,1);return Q(0,G.edge,t)*(G.farKeep+(1-G.farKeep)*n)}function jr(e,t,n,r,i,a,o=0,s=1,c=0){if(r<=0)return[e,t,n];let l=G,u=Math.cos(l.hue),d=Math.sin(l.hue),f=Math.hypot(t,n),p=f>1e-5?Q(0,.5,-(t*u+n*d)/f):0,m=1-Math.min(l.castMax,l.cast*r)*p*s;t*=m,n*=m;let h=Q(l.litLo,l.litHi,e)*(1-Q(l.hiLo,l.hiHi,e)),g=Math.min((l.warm*r+l.boostWarm*c)*Math.min(1,2*i)*h*s,(l.warmShare+l.boostWarmShare*c)*Math.max(0,-(t*u+n*d)));t+=u*g,n+=d*g;let _=e*Mr(a,l.rMin,l.rMax)**+(l.detail*r+l.boostDetail*c);return _+=Math.max(0,l.lift*r+l.boostLift*c-o)*4*_*Math.max(0,1-_),[_,t,n]}function Mr(e,t,n){return e<t?t:e>n?n:e}function Q(e,t,n){let r=Mr((n-e)/(t-e),0,1);return r*r*(3-2*r)}function Nr(e,t,n,r,i){let a=Math.hypot(e,t);if(i<=0||a<1e-6)return[e,t];let o=Math.max(0,e*n+t*r),s=Math.max(0,(a-i*Math.min(ft.k*o,ft.cMax))*(1-i*ft.desat));return[e*s/a,t*s/a]}function Pr(e,t,n,r,i,a,o,s,c){if(c<=0||s<=0)return 0;let l=Math.hypot(t,n);if(l<1e-5)return 0;let u=(t*Math.cos(K.hue)+n*Math.sin(K.hue))/l,d=Q(Math.cos(K.bandOut),Math.cos(K.bandIn),u),f=1-Q(K.rLo,K.rHi,r/Math.max(1e-4,i,a)),p=Q(K.lLo,K.lHi,e);return c*K.mix*s*(d+(1-d)*f)*f*p*(1-o)}function Fr(e){return Q(K.confLo,K.confHi,e)}function Ir(e,t,n,r,i,a,o,s){if(s<=0)return 1;let c=Math.hypot(e,t);if(c<1e-5)return 1;let l=(e*Math.cos(K.warmHue)+t*Math.sin(K.warmHue))/c;return 1-s*(1-Q(K.rLo,K.rHi,n/Math.max(1e-4,r,i)))*Q(K.warmLo,K.warmHi,l)*(1-a)*(1-Mr(o,0,1))}function Lr(e,t,n){return 1-Q(K.rLo,K.rHi,e/Math.max(1e-4,t,n))}function Rr(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n),a=Math.atan2(n,t),o=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),s=Math.max(1-Q(J.bandIn,J.bandOut,Math.abs(o(a-J.bandHue))),1-Q(J.achroma*.5,J.achroma,i)),c=Q(J.wLo,J.wHi,r)*s*Q(J.lLo,J.lHi,e)*(1-Q(J.cLo,J.cHi,i));if(c<=0)return[t,n];let l=a+o(J.hue-a)*J.mix*c,u=i+Math.max(0,J.cMin-i)*c;return[u*Math.cos(l),u*Math.sin(l)]}function zr(e,t,n,r,i,a,o=0){if(r<=0)return[e,t,n];let s=Math.hypot(t,n),c=Math.atan2(n,t),l=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),u=Q(q.keepLo,q.keepHi,s),d=(1-Q(q.warmIn,q.warmOut,Math.abs(l(c-q.warmHue))))*Q(q.warmLo+q.warmHaze*a,q.warmHi+q.warmHaze*a,s),f=Q(q.farLo,q.farHi,Math.abs(l(c-q.targetHue))),p=q.darkLo+(q.darkHi-q.darkLo)*(1-q.darkHaze*a),m=(1-u)*(1-d)*(1-Q(q.brightLo,q.brightHi,e))*Q(q.darkLo,p,e)*(1-q.farKeep*(1-a)*f)*r*q.mix,h=Math.max(0,e)**+(1+q.gamma*r)*(1-q.waterDim*r*i*(1-a)),g=Math.max(s,q.c0+q.c1*h),_=Math.max(s,(q.c0+q.c1*h)*(1+q.hazeChroma*a)),v=g+(q.objChroma-g)*a,y=v+(_-v)*Math.max(i,o),b=1-r*q.neutralDesat*(1-Q(q.neutralLo,q.neutralHi,s))*Q(q.neutralLLo,q.neutralLHi,e);return[h,(t+(y*Math.cos(q.targetHue)-t)*m)*b,(n+(y*Math.sin(q.targetHue)-n)*m)*b]}function Br(e,t,n,r,i){if(r<=0)return[e,t,n];let a=gt,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=s-a.target-2*Math.PI*Math.round((s-a.target)/(2*Math.PI)),u=Q(a.cLo,a.cHi,o)*Q(a.lLo,a.lHi,e),d=1-Q(a.bandHi0,a.bandHi1,c),f=Q(a.bandLo0,a.bandLo1,c)*d*(1-Q(a.violetCLo,a.violetCHi,o)*Q(a.target,a.bandHi1,c)),p=Q(a.greenLo0,a.greenLo1,c),m=p*(1-Q(a.greenTop0,a.greenTop1,c)),h=s+((1-i)*f*a.pull*-l+i*m*a.greenShift)*u*r,g=(1-i)*f+i*p*d,_=Q(a.darkCLo,a.darkCHi,o),v=g*_*_*r;o*=1+a.chroma*v*(1-i);let y=e*(1-(a.dark+(a.darkGreen-a.dark)*i)*v*Q(a.darkLLo,a.darkLHi,e));y*=1-a.blackK*r*(1-Q(a.blackLo,a.blackHi,y));let b=a.shadowC0+a.shadowC1*Q(a.shadowLLo,a.shadowLHi,y);o>b&&(o-=(o-b)*(1-a.shadowKeep)*r*(1-Q(a.shadowFadeLo,a.shadowFadeHi,y)));let x=r*(1+(g-1)*Q(0,a.liftNeutralC,o))*Q(a.liftLLo,1,e);y+=a.lift*x*(1-y),o*=1-a.hiDesat*x;let S=a.warmC*x;return[y,o*Math.cos(h)+S*Math.cos(a.warmHue),o*Math.sin(h)+S*Math.sin(a.warmHue)]}function Vr(e,t,n,r,i){if(r<=0)return[e,t,n,0];let a=_t,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=Q(a.warmIn0,a.warmIn1,c)*(1-Q(a.warmOut0,a.warmOut1,c))*Q(a.warmCLo,a.warmCHi,o)*Q(a.warmLLo,a.warmLHi,e)*r,u=c+(a.warmHue-c)*a.warmPull*l,d=Math.max(o,Math.min(o*(1+a.warmGain*l),a.warmCMax)),f=d*Math.cos(u),p=d*Math.sin(u),m=t*Math.cos(a.warmDir)+n*Math.sin(a.warmDir),h=1-Q(a.sLo,a.sHi,m),g=Q(a.vcLo,a.vcHi,o)*Q(a.vio0,a.vio1,c)*(1-Q(a.vio2,2*Math.PI,c)),_=Q(a.neutralLLo,a.neutralLHi,e)*(1-Q(a.neutralCLo,a.neutralCHi,o)),v=Math.min(a.cMax,a.cK*e)*(1-a.hiDrop*Q(a.hiLo,a.hiHi,e)),y=Q(a.vegCLo,a.vegCHi,o)*Q(a.vegIn0,a.vegIn1,c)*(1-Q(a.vegOut0,a.vegOut1,c))*(1-a.vegGreen*i),b=Q(a.farLo,a.farHi,a.target-c)*Q(a.farMin0,a.farMin1,c)*Q(a.farCLo,a.farCHi,o),x=a.mix*h*(1-g)*(1-y)*(1-_)*Math.min(1,r*(1+a.farBoost*b));f+=(v*Math.cos(a.target)-f)*x,p+=(v*Math.sin(a.target)-p)*x;let S=1-a.neutralK*_*h*r;return f*=S,p*=S,[e*(1-a.shadowK*r*(1-Q(0,a.shadowHi,e))),f,p,Math.max(v*x,d*l)]}function Hr(e,t,n,r){if(n===0)return[e,t];let i=_t,a=Math.hypot(e,t),o=Math.atan2(t,e),s=o<0?o+2*Math.PI:o,c=1-Q(i.sLo,i.sHi,e*Math.cos(i.warmDir)+t*Math.sin(i.warmDir)),l=Q(i.vcLo,i.vcHi,a)*Q(i.vio0,i.vio1,s)*(1-Q(i.vio2,2*Math.PI,s)),u=Q(i.vegCLo,i.vegCHi,a)*Q(i.vegIn0,i.vegIn1,s)*(1-Q(i.vegOut0,i.vegOut1,s))*(1-i.vegGreen*r),d=n*c*(1-l)*(1-u),f=Math.cos(d),p=Math.sin(d);return[e*f-t*p,e*p+t*f]}function Ur(e,t,n,r){let i=Math.hypot(t,n);if(r<=0||i<1e-6)return[t,n];let a=Ot,o=Math.atan2(n,t),s=o<0?o+2*Math.PI:o,c=Q(a.warmIn0,a.warmIn1,s)*(1-Q(a.warmOut0,a.warmOut1,s)),l=Q(a.magIn0,a.magIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),u=Q(a.cLo,a.cHi,i)*Q(a.lLo,a.lHi,e)*(1-Q(a.hiLo,a.hiHi,e)),d=Q(a.coolIn0,a.coolIn1,s)*(1-Q(a.magOut0,a.magOut1,s)),f=1+(a.gain*(1-a.coolCut*d)+a.warmGain*c)*(1-l)*u*r*Math.exp(-i/(a.top+(a.warmTop-a.top)*c));return[t*f,n*f]}function Wr(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=vt,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*Q(i.lLo,i.lHi,e)*(1-Q(i.cLo,i.cHi,r))*(1-Q(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function Gr(e,t,n){return Kr(e,t,n,n.hueFarLo,n.hueFarHi)}function Kr(e,t,n,r,i){let a=Math.hypot(e,t);if(a<n.achroma)return 0;let[,o,s]=E(n.veilColor[0],n.veilColor[1],n.veilColor[2]),c=Math.hypot(o,s)||1,l=Math.max(-1,Math.min(1,(e*o/c+t*s/c)/a));return(1-Q(Math.cos(i),Math.cos(r),l))*Q(n.achroma,n.achroma*2,a)}function qr(e,t,n){let r=Math.hypot(e,t);if(r<n.achroma)return 1;let[,i,a]=E(n.veilColor[0],n.veilColor[1],n.veilColor[2]),o=Math.hypot(i,a)||1,s=Math.max(-1,Math.min(1,(e*i/o+t*a/o)/r)),c=1-Q(Math.cos(n.cosHi),Math.cos(n.cosLo),s),l=Q(n.achroma,n.achroma*2,r);return c+(1-c)*(1-l)}function Jr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>e.fields[(n*e.width+t)*4+1];return(d(a,o)*(1-l)+d(s,o)*l)*(1-u)+(d(a,c)*(1-l)+d(s,c)*l)*u}const Yr=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];function Xr(e,t,n,r,i){let a=Math.min(1,Math.max(0,r)),o=0;for(let[r,i]of Yr)o=Math.max(o,Jr(e,t+r*c.ringR/e.width,n+i*c.ringR/e.height));let s=Q(c.subjLo,c.subjHi,i),l=Q(c.coreIn,1,a)*Q(c.coreLo,c.coreHi,i);return Math.max(a*(s+(1-s)*l),Math.min(Math.min(1,o),s))}function Zr(e,t,n,r,i,a){let o=w(C(e),C(t),C(n)),s=w(r,i,a);return Mr((o+ut.eps)/(s+ut.eps),ut.rMin,ut.rMax)}const Qr=new WeakMap;function $r(e,t,n){let r=e.animals;if(!r)return[0,0];let i=e.strength??Qr.get(r);i||(i=s(r).data,Qr.set(r,i));let a=r.width,o=r.height,c=Math.min(a-1,Math.max(0,Math.floor(t*a))),l=Math.min(o-1,Math.max(0,Math.floor(n*o))),u=Math.min(Math.max(t*a-.5,0),a-1),d=Math.min(Math.max(n*o-.5,0),o-1),f=Math.floor(u),p=Math.floor(d),m=Math.min(f+1,a-1),h=Math.min(p+1,o-1),g=u-f,_=d-p,v=(e,t)=>i[(t*a+e)*4+1],y=(v(f,p)*(1-g)+v(m,p)*g)*(1-_)+(v(f,h)*(1-g)+v(m,h)*g)*_;return[i[(l*a+c)*4],y]}const $={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=E(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function ei(e,t,n,r){let i=t*n,a=new Float32Array(i),o=new Float32Array(i);for(let t=0;t<i;t++){let n=.2126*te[e[t*4]]+.7152*te[e[t*4+1]]+.0722*te[e[t*4+2]];a[t]=n,o[t]=n*n}let s=oi(a,t,n,2),c=oi(o,t,n,2),[,l,u]=E(r[0],r[1],r[2]),d=Math.hypot(l,u)||1,f=Math.cos($.hueMax),p=[],m=Math.floor(n*(1-$.near)),h=0,g=0,_=0;for(let r=0;r<n;r+=2)for(let n=0;n<t;n+=2){h++,r>=m&&g++;let i=r*t+n;if(a[i]<$.lumMin)continue;let o=s[i],v=Math.sqrt(Math.max(0,c[i]-o*o));if(v<$.texLo*o||v>$.texHi*o)continue;let[,y,b]=E(te[e[i*4]],te[e[i*4+1]],te[e[i*4+2]]),x=Math.hypot(y,b);x>$.cMax||x>$.achroma&&(y*l+b*u)/(x*d)<f||(p.push(i),r>=m&&_++)}let v=_/Math.max(1,g),y=v>=$.fracHi,b=y?p.filter(e=>e>=m*t):p,x=y?v:p.length/Math.max(1,h);return b.sort((e,t)=>a[t]-a[e]),{idx:b.slice(0,Math.ceil(b.length*$.top)),frac:x}}function ti(e,t,n,r,i,a,o){return s=>{let c=hr({params:ai(i,s),settings:rt,depth:a,clahe:o}),l=0,u=0,d=0;for(let i of r){let r=(i%t+.5)/t,a=(Math.floor(i/t)+.5)/n,o=xr(c,e[i*4]/255,e[i*4+1]/255,e[i*4+2]/255,r,a);l+=C(o[0]),u+=C(o[1]),d+=C(o[2])}let[,f,p]=E(l/r.length,u/r.length,d/r.length);return[f,p]}}function ni(e,t,n,r){let{idx:i,frac:a}=ei(e,t,n,r.veilColor);if(a<$.fracLo||i.length<12)return null;let o=Math.max(1,Math.floor(i.length/$.samples)),s=[];for(let e=0;e<i.length;e+=o)s.push(i[e]);return{pick:s,frac:a}}function ri(e,t,n,r,i,a){let o=ni(e,t,n,r);return o?{ab:ti(e,t,n,o.pick,r,i,a)([0,0]),frac:o.frac}:null}function ii(e,t,n,r,i,a,o){let s=ni(e,t,n,r);if(!s)return null;let{frac:c}=s,l=ti(e,t,n,s.pick,r,i,a),u=e=>Math.max(-$.maxLog,Math.min($.maxLog,e)),d=e=>Math.hypot(e[0]-o[0],e[1]-o[1]),f=[0,0],p=l(f),m=p;for(let e=0;e<$.iterations&&d(p)>$.tol;e++){let e=l([f[0]+$.eps,f[1]]),t=l([f[0],f[1]+$.eps]),n=(e[0]-p[0])/$.eps,r=(e[1]-p[1])/$.eps,i=(t[0]-p[0])/$.eps,a=(t[1]-p[1])/$.eps,s=n*a-i*r;if(!Number.isFinite(s)||Math.abs(s)<1e-6)break;let c=o[0]-p[0],m=o[1]-p[1],h=(a*c-i*m)/s,g=(-r*c+n*m)/s,_=Math.hypot(h,g);_>$.maxStep&&(h*=$.maxStep/_,g*=$.maxStep/_);let v=!1;for(let e=0;e<3&&!v;e++,h/=2,g/=2){let e=[u(f[0]+h),u(f[1]+g)],t=l(e);d(t)<d(p)&&(f=e,p=t,v=!0)}if(!v)break}return{log:f,frac:c,before:m,after:p}}function ai(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*$.water),a=Math.exp(t[1]*$.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}function oi(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0,s=0;for(let i=Math.max(0,n-r);i<=Math.min(t-1,n+r);i++)o+=e[a*t+i],s++;i[a*t+n]=o/s}for(let e=0;e<n;e++)for(let o=0;o<t;o++){let s=0,c=0;for(let a=Math.max(0,e-r);a<=Math.min(n-1,e+r);a++)s+=i[a*t+o],c++;a[e*t+o]=s/c}return a}function si(e,t,n=!1){let r=t.backdropFit??e.backdropFit,i={seabedNeed:t.seabedNeed??e.seabedNeed,seabedLw:t.seabedLw??e.seabedLw,seabedLb:t.seabedLb??e.seabedLb,seabedGrid:t.seabedGrid??e.seabedGrid},a=t.frameBlack??t.hazeBlack,o=ci.margin>0&&e.hazeBlack>1e-6?Math.min(1,ci.margin*a/e.hazeBlack):1,s={frameBlack:a,...o<1?{hazeBlack:e.hazeBlack*o,hazeFloor:e.hazeFloor.map(e=>e*o)}:{}};return n?{...e,...i,...s,backdropFit:r}:{...e,...i,...s,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}const ci={margin:1.1},li={calmLo:.1,calmHi:.4,openLo:.05,openHi:.3},ui={trendTrust:.5,minSamples:4,kendall:.8,deadband:.1,stepMax:.6,maxRate:.1,maxSwing:Math.log(1.24),spreadLo:.06,spreadHi:.18,residual:.008};function di(e){let t=e.filter(e=>e.w>0&&Number.isFinite(e.log[0])&&Number.isFinite(e.log[1])).sort((e,t)=>e.t-t.t);if(!t.length)return null;let n=t.map(e=>e.w),r=e=>{let t=yi(e,n),r=yi(e.map(e=>Math.abs(e-t)),n);return t*(1-hi(ui.spreadLo,ui.spreadHi,r))},i={t:[yi(t.map(e=>e.t),n)],r:[r(t.map(e=>e.log[0]))],b:[r(t.map(e=>e.log[1]))]},a=t.filter(e=>e.w>=ui.trendTrust);if(a.length<ui.minSamples)return i;let o=a.map(e=>e.t),s=a.map(e=>e.w),c=fi(o,a.map(e=>e.log[0]),s);return!c||Math.abs(c[c.length-1]-c[0])<ui.deadband?i:{t:o,r:c,b:fi(o,a.map(e=>e.log[1]),s)??o.map(()=>yi(a.map(e=>e.log[1]),s))}}function fi(e,t,n){let r=t.map((e,n)=>_i(t[Math.max(0,n-1)],t[n],t[Math.min(t.length-1,n+1)])),i=bi(r);if(Math.abs(i)<ui.kendall)return null;let a=xi(r,n,i>0),o=Math.abs(a[a.length-1]-a[0]);for(let e=1;e<a.length;e++)if(Math.abs(a[e]-a[e-1])>ui.stepMax*o)return null;let s=a.length>>1;for(let t=s+1;t<a.length;t++)a[t]=vi(a[t],a[t-1],ui.maxRate*(e[t]-e[t-1]));for(let t=s-1;t>=0;t--)a[t]=vi(a[t],a[t+1],ui.maxRate*(e[t+1]-e[t]));let c=Math.min(a[0],a[a.length-1]),l=Math.max(a[0],a[a.length-1]),u=l-c>ui.maxSwing?ui.maxSwing/(l-c):1,d=(c+l)/2;return a.map(e=>Math.max(-$.maxLog,Math.min($.maxLog,d+(e-d)*u)))}function pi(e,t,n,r,i){let a=e.map((e,i)=>({px:e,t:t[i]??i,a:Pn(e,n,r)})),o=[],s=[];for(let e of a){if(mi(e.a.params)<.5)continue;let t=ri(e.px,n,r,si(i,e.a.params),e.a.depth,e.a.clahe);!t||t.frac<$.fracHi||(o.push(t.ab[0]),s.push(t.ab[1]))}if(o.length<2)return null;let c=[Math.min(gi(o),$.neutral[0]+$.pinkMax),gi(s)],l=[];for(let e of a){let t=mi(e.a.params);if(t<=0)continue;let a=ii(e.px,n,r,si(i,e.a.params),e.a.depth,e.a.clahe,c);if(!a)continue;let o=Math.max(Math.abs(a.log[0]),Math.abs(a.log[1]))>=$.maxLog-1e-6,s=Math.hypot(a.after[0]-c[0],a.after[1]-c[1])>ui.residual;!o&&!s&&l.push({t:e.t,log:a.log,w:hi($.fracLo,$.fracHi,a.frac)*t})}return{target:c,curve:di(l),samples:l}}function mi(e){let t=Math.max(e.calm??0,e.calmTone??0),n=hi(li.openLo,li.openHi,e.backdrop??0);return(1-hi(li.calmLo,li.calmHi,t))*(1-n)*(1-Ce(e))}function hi(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function gi(e){let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function _i(e,t,n){return Math.max(Math.min(e,t),Math.min(Math.max(e,t),n))}function vi(e,t,n){return Math.max(t-n,Math.min(t+n,e))}function yi(e,t){let n=e.map((e,n)=>({x:e,w:Math.max(0,t[n]??0)})).filter(e=>e.w>0).sort((e,t)=>e.x-t.x);if(!n.length)return 0;let r=n.reduce((e,t)=>e+t.w,0)/2,i=0;for(let e=0;e<n.length;e++){if(i+=n[e].w,Math.abs(i-r)<1e-12&&e+1<n.length)return(n[e].x+n[e+1].x)/2;if(i>r)return n[e].x}return n[n.length-1].x}function bi(e){let t=0,n=0;for(let r=0;r<e.length;r++)for(let i=r+1;i<e.length;i++)t+=Math.sign(e[i]-e[r]),n++;return n?t/n:0}function xi(e,t,n){let r=n?e:e.map(e=>-e),i=[];for(let e=0;e<r.length;e++)for(i.push({sum:r[e]*t[e],w:t[e],n:1});i.length>1&&i[i.length-2].sum/i[i.length-2].w>i[i.length-1].sum/i[i.length-1].w;){let e=i.pop(),t=i[i.length-1];t.sum+=e.sum,t.w+=e.w,t.n+=e.n}let a=[];for(let e of i)for(let t=0;t<e.n;t++)a.push((n?1:-1)*(e.sum/e.w));return a}self.onmessage=e=>{if(e.data.kind===`balance`){let{id:t,width:n,height:r,shots:i}=e.data,a={kind:`balance`,id:t,shots:i.map(e=>{let t=pi(e.thumbs.map(e=>new Uint8ClampedArray(e)),e.times,n,r,e.lock);return t?{target:t.target,curve:t.curve}:null})};self.postMessage(a);return}let{id:t,rgba:n,width:r,height:i,seeds:a}=e.data,o=performance.now(),s=Pn(new Uint8ClampedArray(n),r,i,{seeds:a}),c=Yt(s.depth),l=Xt(s.depth),u=Zt(s.clahe),d={id:t,params:s.params,mean:s.mean,fields:{width:s.depth.width,height:s.depth.height,data:c},guide:{width:s.depth.width,height:s.depth.height,data:l},clahe:{tilesX:s.clahe.tilesX,tilesY:s.clahe.tilesY,bins:s.clahe.bins,data:u},animals:s.depth.animals,blobs:s.depth.blobs,...s.depth.popConf?{popConf:s.depth.popConf}:{},ms:performance.now()-o},f=[c.buffer,l.buffer,u.buffer];s.depth.animals&&f.push(s.depth.animals.labels.buffer),s.depth.popConf&&f.push(s.depth.popConf.buffer),self.postMessage(d,f)};