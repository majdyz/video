var e=Object.defineProperty,t=(t,n)=>{let r={};for(var i in t)e(r,i,{get:t[i],enumerable:!0});return n||e(r,Symbol.toStringTag,{value:`Module`}),r},n=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling `require` for "'+e+"\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.")}),r=t({InferenceSession:()=>Ce,TRACE:()=>ge,TRACE_FUNC_BEGIN:()=>ve,TRACE_FUNC_END:()=>ye,Tensor:()=>M,TrainingSession:()=>Me,default:()=>Bu,env:()=>T,registerBackend:()=>h}),i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=Object.getOwnPropertyNames,s=Object.prototype.hasOwnProperty,c=(e=>typeof n<`u`?n:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof n<`u`?n:e)[t]}):e)(function(e){if(typeof n<`u`)return n.apply(this,arguments);throw Error(`Dynamic require of "`+e+`" is not supported`)}),l=(e,t)=>()=>(e&&(t=e(e=0)),t),u=(e,t)=>{for(var n in t)i(e,n,{get:t[n],enumerable:!0})},d=(e,t,n,r)=>{if(t&&typeof t==`object`||typeof t==`function`)for(let c of o(t))!s.call(e,c)&&c!==n&&i(e,c,{get:()=>t[c],enumerable:!(r=a(t,c))||r.enumerable});return e},f=e=>d(i({},`__esModule`,{value:!0}),e),p,m,h,g,_,v=l(()=>{p=new Map,m=[],h=(e,t,n)=>{if(t&&typeof t.init==`function`&&typeof t.createInferenceSessionHandler==`function`){let r=p.get(e);if(r===void 0)p.set(e,{backend:t,priority:n});else{if(r.priority>n)return;if(r.priority===n&&r.backend!==t)throw Error(`cannot register backend "${e}" using priority ${n}`)}if(n>=0){let t=m.indexOf(e);t!==-1&&m.splice(t,1);for(let t=0;t<m.length;t++)if(p.get(m[t]).priority<=n){m.splice(t,0,e);return}m.push(e)}return}throw TypeError(`not a valid backend`)},g=async e=>{let t=p.get(e);if(!t)return`backend not found.`;if(t.initialized)return t.backend;if(t.aborted)return t.error;{let n=!!t.initPromise;try{return n||(t.initPromise=t.backend.init(e)),await t.initPromise,t.initialized=!0,t.backend}catch(e){return n||(t.error=`${e}`,t.aborted=!0),t.error}finally{delete t.initPromise}}},_=async e=>{let t=e.executionProviders||[],n=t.map(e=>typeof e==`string`?e:e.name),r=n.length===0?m:n,i,a=[],o=new Set;for(let e of r){let t=await g(e);typeof t==`string`?a.push({name:e,err:t}):(i||=t,i===t&&o.add(e))}if(!i)throw Error(`no available backend found. ERR: ${a.map(e=>`[${e.name}] ${e.err}`).join(`, `)}`);for(let{name:e,err:t}of a)n.includes(e)&&console.warn(`removing requested execution provider "${e}" from session options because it is not available: ${t}`);let s=t.filter(e=>o.has(typeof e==`string`?e:e.name));return[i,new Proxy(e,{get:(e,t)=>t===`executionProviders`?s:Reflect.get(e,t)})]}}),y=l(()=>{v()}),b,x=l(()=>{b=`1.20.1`}),S,C,w=l(()=>{x(),S=`warning`,C={wasm:{},webgl:{},webgpu:{},versions:{common:b},set logLevel(e){if(e!==void 0){if(typeof e!=`string`||[`verbose`,`info`,`warning`,`error`,`fatal`].indexOf(e)===-1)throw Error(`Unsupported logging level: ${e}`);S=e}},get logLevel(){return S}},Object.defineProperty(C,`logLevel`,{enumerable:!0})}),T,E=l(()=>{w(),T=C}),D,O,k=l(()=>{D=(e,t)=>{let n=typeof document<`u`?document.createElement(`canvas`):new OffscreenCanvas(1,1);n.width=e.dims[3],n.height=e.dims[2];let r=n.getContext(`2d`);if(r!=null){let i,a;t?.tensorLayout!==void 0&&t.tensorLayout===`NHWC`?(i=e.dims[2],a=e.dims[3]):(i=e.dims[3],a=e.dims[2]);let o=t?.format===void 0?`RGB`:t.format,s=t?.norm,c,l;s===void 0||s.mean===void 0?c=[255,255,255,255]:typeof s.mean==`number`?c=[s.mean,s.mean,s.mean,s.mean]:(c=[s.mean[0],s.mean[1],s.mean[2],0],s.mean[3]!==void 0&&(c[3]=s.mean[3])),s===void 0||s.bias===void 0?l=[0,0,0,0]:typeof s.bias==`number`?l=[s.bias,s.bias,s.bias,s.bias]:(l=[s.bias[0],s.bias[1],s.bias[2],0],s.bias[3]!==void 0&&(l[3]=s.bias[3]));let u=a*i,d=0,f=u,p=u*2,m=-1;o===`RGBA`?(d=0,f=u,p=u*2,m=u*3):o===`RGB`?(d=0,f=u,p=u*2):o===`RBG`&&(d=0,p=u,f=u*2);for(let t=0;t<a;t++)for(let n=0;n<i;n++){let i=(e.data[d++]-l[0])*c[0],a=(e.data[f++]-l[1])*c[1],o=(e.data[p++]-l[2])*c[2],s=m===-1?255:(e.data[m++]-l[3])*c[3];r.fillStyle=`rgba(`+i+`,`+a+`,`+o+`,`+s+`)`,r.fillRect(n,t,1,1)}if(`toDataURL`in n)return n.toDataURL();throw Error(`toDataURL is not supported`)}else throw Error(`Can not access image data`)},O=(e,t)=>{let n=typeof document<`u`?document.createElement(`canvas`).getContext(`2d`):new OffscreenCanvas(1,1).getContext(`2d`),r;if(n!=null){let i,a,o;t?.tensorLayout!==void 0&&t.tensorLayout===`NHWC`?(i=e.dims[2],a=e.dims[1],o=e.dims[3]):(i=e.dims[3],a=e.dims[2],o=e.dims[1]);let s=t!==void 0&&t.format!==void 0?t.format:`RGB`,c=t?.norm,l,u;c===void 0||c.mean===void 0?l=[255,255,255,255]:typeof c.mean==`number`?l=[c.mean,c.mean,c.mean,c.mean]:(l=[c.mean[0],c.mean[1],c.mean[2],255],c.mean[3]!==void 0&&(l[3]=c.mean[3])),c===void 0||c.bias===void 0?u=[0,0,0,0]:typeof c.bias==`number`?u=[c.bias,c.bias,c.bias,c.bias]:(u=[c.bias[0],c.bias[1],c.bias[2],0],c.bias[3]!==void 0&&(u[3]=c.bias[3]));let d=a*i;if(t!==void 0&&(t.format!==void 0&&o===4&&t.format!==`RGBA`||o===3&&t.format!==`RGB`&&t.format!==`BGR`))throw Error(`Tensor format doesn't match input tensor dims`);let f=0,p=1,m=2,h=3,g=0,_=d,v=d*2,y=-1;s===`RGBA`?(g=0,_=d,v=d*2,y=d*3):s===`RGB`?(g=0,_=d,v=d*2):s===`RBG`&&(g=0,v=d,_=d*2),r=n.createImageData(i,a);for(let t=0;t<a*i;f+=4,p+=4,m+=4,h+=4,t++)r.data[f]=(e.data[g++]-u[0])*l[0],r.data[p]=(e.data[_++]-u[1])*l[1],r.data[m]=(e.data[v++]-u[2])*l[2],r.data[h]=y===-1?255:(e.data[y++]-u[3])*l[3]}else throw Error(`Can not access image data`);return r}}),ee,A,te,ne,re,ie,ae=l(()=>{me(),ee=(e,t)=>{if(e===void 0)throw Error(`Image buffer must be defined`);if(t.height===void 0||t.width===void 0)throw Error(`Image height and width must be defined`);if(t.tensorLayout===`NHWC`)throw Error(`NHWC Tensor layout is not supported yet`);let{height:n,width:r}=t,i=t.norm??{mean:255,bias:0},a,o;a=typeof i.mean==`number`?[i.mean,i.mean,i.mean,i.mean]:[i.mean[0],i.mean[1],i.mean[2],i.mean[3]??255],o=typeof i.bias==`number`?[i.bias,i.bias,i.bias,i.bias]:[i.bias[0],i.bias[1],i.bias[2],i.bias[3]??0];let s=t.format===void 0?`RGBA`:t.format,c=t.tensorFormat!==void 0&&t.tensorFormat!==void 0?t.tensorFormat:`RGB`,l=n*r,u=c===`RGBA`?new Float32Array(l*4):new Float32Array(l*3),d=4,f=0,p=1,m=2,h=3,g=0,_=l,v=l*2,y=-1;s===`RGB`&&(d=3,f=0,p=1,m=2,h=-1),c===`RGBA`?y=l*3:c===`RBG`?(g=0,v=l,_=l*2):c===`BGR`&&(v=0,_=l,g=l*2);for(let t=0;t<l;t++,f+=d,m+=d,p+=d,h+=d)u[g++]=(e[f]+o[0])/a[0],u[_++]=(e[p]+o[1])/a[1],u[v++]=(e[m]+o[2])/a[2],y!==-1&&h!==-1&&(u[y++]=(e[h]+o[3])/a[3]);return c===`RGBA`?new j(`float32`,u,[1,4,n,r]):new j(`float32`,u,[1,3,n,r])},A=async(e,t)=>{let n=typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement,r=typeof ImageData<`u`&&e instanceof ImageData,i=typeof ImageBitmap<`u`&&e instanceof ImageBitmap,a=typeof e==`string`,o,s=t??{},c=()=>{if(typeof document<`u`)return document.createElement(`canvas`);if(typeof OffscreenCanvas<`u`)return new OffscreenCanvas(1,1);throw Error(`Canvas is not supported`)},l=e=>typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||e instanceof OffscreenCanvas?e.getContext(`2d`):null;if(n){let n=c();n.width=e.width,n.height=e.height;let r=l(n);if(r!=null){let n=e.height,i=e.width;if(t!==void 0&&t.resizedHeight!==void 0&&t.resizedWidth!==void 0&&(n=t.resizedHeight,i=t.resizedWidth),t!==void 0){if(s=t,t.tensorFormat!==void 0)throw Error(`Image input config format must be RGBA for HTMLImageElement`);s.tensorFormat=`RGBA`,s.height=n,s.width=i}else s.tensorFormat=`RGBA`,s.height=n,s.width=i;r.drawImage(e,0,0),o=r.getImageData(0,0,i,n).data}else throw Error(`Can not access image data`)}else if(r){let n,r;if(t!==void 0&&t.resizedWidth!==void 0&&t.resizedHeight!==void 0?(n=t.resizedHeight,r=t.resizedWidth):(n=e.height,r=e.width),t!==void 0&&(s=t),s.format=`RGBA`,s.height=n,s.width=r,t!==void 0){let t=c();t.width=r,t.height=n;let i=l(t);if(i!=null)i.putImageData(e,0,0),o=i.getImageData(0,0,r,n).data;else throw Error(`Can not access image data`)}else o=e.data}else if(i){if(t===void 0)throw Error(`Please provide image config with format for Imagebitmap`);let n=c();n.width=e.width,n.height=e.height;let r=l(n);if(r!=null){let t=e.height,n=e.width;return r.drawImage(e,0,0,n,t),o=r.getImageData(0,0,n,t).data,s.height=t,s.width=n,ee(o,s)}else throw Error(`Can not access image data`)}else{if(a)return new Promise((t,n)=>{let r=c(),i=l(r);if(!e||!i)return n();let a=new Image;a.crossOrigin=`Anonymous`,a.src=e,a.onload=()=>{r.width=a.width,r.height=a.height,i.drawImage(a,0,0,r.width,r.height);let e=i.getImageData(0,0,r.width,r.height);s.height=r.height,s.width=r.width,t(ee(e.data,s))}});throw Error(`Input data provided is not supported - aborted tensor creation`)}if(o!==void 0)return ee(o,s);throw Error(`Input data provided is not supported - aborted tensor creation`)},te=(e,t)=>{let{width:n,height:r,download:i,dispose:a}=t;return new j({location:`texture`,type:`float32`,texture:e,dims:[1,r,n,4],download:i,dispose:a})},ne=(e,t)=>{let{dataType:n,dims:r,download:i,dispose:a}=t;return new j({location:`gpu-buffer`,type:n??`float32`,gpuBuffer:e,dims:r,download:i,dispose:a})},re=(e,t)=>{let{dataType:n,dims:r,download:i,dispose:a}=t;return new j({location:`ml-tensor`,type:n??`float32`,mlTensor:e,dims:r,download:i,dispose:a})},ie=(e,t,n)=>new j({location:`cpu-pinned`,type:e,data:t,dims:n??[t.length]})}),oe,se,ce,le,ue=l(()=>{oe=new Map([[`float32`,Float32Array],[`uint8`,Uint8Array],[`int8`,Int8Array],[`uint16`,Uint16Array],[`int16`,Int16Array],[`int32`,Int32Array],[`bool`,Uint8Array],[`float64`,Float64Array],[`uint32`,Uint32Array],[`int4`,Uint8Array],[`uint4`,Uint8Array]]),se=new Map([[Float32Array,`float32`],[Uint8Array,`uint8`],[Int8Array,`int8`],[Uint16Array,`uint16`],[Int16Array,`int16`],[Int32Array,`int32`],[Float64Array,`float64`],[Uint32Array,`uint32`]]),ce=!1,le=()=>{if(!ce){ce=!0;let e=typeof BigInt64Array<`u`&&BigInt64Array.from,t=typeof BigUint64Array<`u`&&BigUint64Array.from,n=typeof Float16Array<`u`&&Float16Array.from;e&&(oe.set(`int64`,BigInt64Array),se.set(BigInt64Array,`int64`)),t&&(oe.set(`uint64`,BigUint64Array),se.set(BigUint64Array,`uint64`)),n?(oe.set(`float16`,Float16Array),se.set(Float16Array,`float16`)):oe.set(`float16`,Uint16Array)}}}),de,fe,pe=l(()=>{me(),de=e=>{let t=1;for(let n=0;n<e.length;n++){let r=e[n];if(typeof r!=`number`||!Number.isSafeInteger(r))throw TypeError(`dims[${n}] must be an integer, got: ${r}`);if(r<0)throw RangeError(`dims[${n}] must be a non-negative integer, got: ${r}`);t*=r}return t},fe=(e,t)=>{switch(e.location){case`cpu`:return new j(e.type,e.data,t);case`cpu-pinned`:return new j({location:`cpu-pinned`,data:e.data,type:e.type,dims:t});case`texture`:return new j({location:`texture`,texture:e.texture,type:e.type,dims:t});case`gpu-buffer`:return new j({location:`gpu-buffer`,gpuBuffer:e.gpuBuffer,type:e.type,dims:t});case`ml-tensor`:return new j({location:`ml-tensor`,mlTensor:e.mlTensor,type:e.type,dims:t});default:throw Error(`tensorReshape: tensor location ${e.location} is not supported`)}}}),j,me=l(()=>{k(),ae(),ue(),pe(),j=class{constructor(e,t,n){le();let r,i;if(typeof e==`object`&&`location`in e)switch(this.dataLocation=e.location,r=e.type,i=e.dims,e.location){case`cpu-pinned`:{let t=oe.get(r);if(!t)throw TypeError(`unsupported type "${r}" to create tensor from pinned buffer`);if(!(e.data instanceof t))throw TypeError(`buffer should be of type ${t.name}`);this.cpuData=e.data;break}case`texture`:if(r!==`float32`)throw TypeError(`unsupported type "${r}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break;case`gpu-buffer`:if(r!==`float32`&&r!==`float16`&&r!==`int32`&&r!==`int64`&&r!==`uint32`&&r!==`uint8`&&r!==`bool`&&r!==`uint4`&&r!==`int4`)throw TypeError(`unsupported type "${r}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break;case`ml-tensor`:if(r!==`float32`&&r!==`float16`&&r!==`int32`&&r!==`int64`&&r!==`uint32`&&r!==`uint64`&&r!==`int8`&&r!==`uint8`&&r!==`bool`)throw TypeError(`unsupported type "${r}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break;default:throw Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let a,o;if(typeof e==`string`)if(r=e,o=n,e===`string`){if(!Array.isArray(t))throw TypeError(`A string tensor's data must be a string array.`);a=t}else{let n=oe.get(e);if(n===void 0)throw TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(t)){if(e===`float16`&&n===Uint16Array||e===`uint4`||e===`int4`)throw TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${n.name} as data.`);a=e===`uint64`||e===`int64`?n.from(t,BigInt):n.from(t)}else if(t instanceof n)a=t;else if(t instanceof Uint8ClampedArray)if(e===`uint8`)a=Uint8Array.from(t);else throw TypeError(`A Uint8ClampedArray tensor's data must be type of uint8`);else throw TypeError(`A ${r} tensor's data must be type of ${n}`)}else if(o=t,Array.isArray(e)){if(e.length===0)throw TypeError(`Tensor type cannot be inferred from an empty array.`);let t=typeof e[0];if(t===`string`)r=`string`,a=e;else if(t===`boolean`)r=`bool`,a=Uint8Array.from(e);else throw TypeError(`Invalid element type of data array: ${t}.`)}else if(e instanceof Uint8ClampedArray)r=`uint8`,a=Uint8Array.from(e);else{let t=se.get(e.constructor);if(t===void 0)throw TypeError(`Unsupported type for tensor data: ${e.constructor}.`);r=t,a=e}if(o===void 0)o=[a.length];else if(!Array.isArray(o))throw TypeError(`A tensor's dims must be a number array`);i=o,this.cpuData=a,this.dataLocation=`cpu`}let a=de(i);if(this.cpuData&&a!==this.cpuData.length&&!((r===`uint4`||r===`int4`)&&Math.ceil(a/2)===this.cpuData.length))throw Error(`Tensor's size(${a}) does not match data length(${this.cpuData.length}).`);this.type=r,this.dims=i,this.size=a}static async fromImage(e,t){return A(e,t)}static fromTexture(e,t){return te(e,t)}static fromGpuBuffer(e,t){return ne(e,t)}static fromMLTensor(e,t){return re(e,t)}static fromPinnedBuffer(e,t,n){return ie(e,t,n)}toDataURL(e){return D(this,e)}toImageData(e){return O(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw Error(`The data is not stored as a WebGL texture.`);return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw Error(`The data is not stored as a WebGPU buffer.`);return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw Error(`The data is not stored as a WebNN MLTensor.`);return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case`cpu`:case`cpu-pinned`:return this.data;case`texture`:case`gpu-buffer`:case`ml-tensor`:if(!this.downloader)throw Error(`The current tensor is not created with a specified data downloader.`);if(this.isDownloading)throw Error(`The current tensor is being downloaded.`);try{this.isDownloading=!0;let t=await this.downloader();return this.downloader=void 0,this.dataLocation=`cpu`,this.cpuData=t,e&&this.disposer&&(this.disposer(),this.disposer=void 0),t}finally{this.isDownloading=!1}default:throw Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw Error(`The current tensor is being downloaded.`);this.disposer&&=(this.disposer(),void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation=`none`}ensureValid(){if(this.dataLocation===`none`)throw Error(`The tensor is disposed.`)}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw Error(`Cannot reshape a tensor that owns GPU resource.`);return fe(this,e)}}}),M,he=l(()=>{me(),M=j}),ge,_e,ve,ye,be=l(()=>{w(),ge=(e,t)=>{(typeof C.trace>`u`?!C.wasm.trace:!C.trace)||console.timeStamp(`${e}::ORT::${t}`)},_e=(e,t)=>{let n=Error().stack?.split(/\r\n|\r|\n/g)||[],r=!1;for(let i=0;i<n.length;i++){if(r&&!n[i].includes(`TRACE_FUNC`)){let r=`FUNC_${e}::${n[i].trim().split(` `)[1]}`;t&&(r+=`::${t}`),ge(`CPU`,r);return}n[i].includes(`TRACE_FUNC`)&&(r=!0)}},ve=e=>{(typeof C.trace>`u`?!C.wasm.trace:!C.trace)||_e(`BEGIN`,e)},ye=e=>{(typeof C.trace>`u`?!C.wasm.trace:!C.trace)||_e(`END`,e)}}),xe,Se=l(()=>{v(),he(),be(),xe=class e{constructor(e){this.handler=e}async run(e,t,n){ve();let r={},i={};if(typeof e!=`object`||!e||e instanceof M||Array.isArray(e))throw TypeError(`'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.`);let a=!0;if(typeof t==`object`){if(t===null)throw TypeError(`Unexpected argument[1]: cannot be null.`);if(t instanceof M)throw TypeError(`'fetches' cannot be a Tensor`);if(Array.isArray(t)){if(t.length===0)throw TypeError(`'fetches' cannot be an empty array.`);a=!1;for(let e of t){if(typeof e!=`string`)throw TypeError(`'fetches' must be a string array or an object.`);if(this.outputNames.indexOf(e)===-1)throw RangeError(`'fetches' contains invalid output name: ${e}.`);r[e]=null}if(typeof n==`object`&&n)i=n;else if(typeof n<`u`)throw TypeError(`'options' must be an object.`)}else{let e=!1,o=Object.getOwnPropertyNames(t);for(let n of this.outputNames)if(o.indexOf(n)!==-1){let i=t[n];(i===null||i instanceof M)&&(e=!0,a=!1,r[n]=i)}if(e){if(typeof n==`object`&&n)i=n;else if(typeof n<`u`)throw TypeError(`'options' must be an object.`)}else i=t}}else if(typeof t<`u`)throw TypeError(`Unexpected argument[1]: must be 'fetches' or 'options'.`);for(let t of this.inputNames)if(typeof e[t]>`u`)throw Error(`input '${t}' is missing in 'feeds'.`);if(a)for(let e of this.outputNames)r[e]=null;let o=await this.handler.run(e,r,i),s={};for(let e in o)if(Object.hasOwnProperty.call(o,e)){let t=o[e];t instanceof M?s[e]=t:s[e]=new M(t.type,t.data,t.dims)}return ye(),s}async release(){return this.handler.dispose()}static async create(t,n,r,i){ve();let a,o={};if(typeof t==`string`){if(a=t,typeof n==`object`&&n)o=n;else if(typeof n<`u`)throw TypeError(`'options' must be an object.`)}else if(t instanceof Uint8Array){if(a=t,typeof n==`object`&&n)o=n;else if(typeof n<`u`)throw TypeError(`'options' must be an object.`)}else if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<`u`&&t instanceof SharedArrayBuffer){let e=t,s=0,c=t.byteLength;if(typeof n==`object`&&n)o=n;else if(typeof n==`number`){if(s=n,!Number.isSafeInteger(s))throw RangeError(`'byteOffset' must be an integer.`);if(s<0||s>=e.byteLength)throw RangeError(`'byteOffset' is out of range [0, ${e.byteLength}).`);if(c=t.byteLength-s,typeof r==`number`){if(c=r,!Number.isSafeInteger(c))throw RangeError(`'byteLength' must be an integer.`);if(c<=0||s+c>e.byteLength)throw RangeError(`'byteLength' is out of range (0, ${e.byteLength-s}].`);if(typeof i==`object`&&i)o=i;else if(typeof i<`u`)throw TypeError(`'options' must be an object.`)}else if(typeof r<`u`)throw TypeError(`'byteLength' must be a number.`)}else if(typeof n<`u`)throw TypeError(`'options' must be an object.`);a=new Uint8Array(e,s,c)}else throw TypeError(`Unexpected argument[0]: must be 'path' or 'buffer'.`);let[s,c]=await _(o),l=await s.createInferenceSessionHandler(a,c);return ye(),new e(l)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}}}),Ce,we=l(()=>{Se(),Ce=xe}),Te=l(()=>{}),Ee=l(()=>{}),De=l(()=>{}),Oe=l(()=>{}),ke,Ae,je=l(()=>{v(),he(),ke=`Training backend could not be resolved. Make sure you're using the correct configuration & WebAssembly files.`,Ae=class e{constructor(e,t,n){this.handler=e,this.hasOptimizerModel=t,this.hasEvalModel=n}get trainingInputNames(){return this.handler.inputNames}get trainingOutputNames(){return this.handler.outputNames}get evalInputNames(){if(this.hasEvalModel)return this.handler.evalInputNames;throw Error(`This training session has no evalModel loaded.`)}get evalOutputNames(){if(this.hasEvalModel)return this.handler.evalOutputNames;throw Error(`This training session has no evalModel loaded.`)}static async create(t,n){let r=t.evalModel||``,i=t.optimizerModel||``,[a,o]=await _(n||{});if(a.createTrainingSessionHandler)return new e(await a.createTrainingSessionHandler(t.checkpointState,t.trainModel,r,i,o),!!t.optimizerModel,!!t.evalModel);throw Error(ke)}typeNarrowingForRunStep(e,t,n,r,i){let a={},o={};if(typeof n!=`object`||!n||n instanceof M||Array.isArray(n))throw TypeError(`'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.`);let s=!0;if(typeof r==`object`){if(r===null)throw TypeError(`Unexpected argument[1]: cannot be null.`);if(r instanceof M)throw TypeError(`'fetches' cannot be a Tensor`);if(Array.isArray(r)){if(r.length===0)throw TypeError(`'fetches' cannot be an empty array.`);s=!1;for(let e of r){if(typeof e!=`string`)throw TypeError(`'fetches' must be a string array or an object.`);if(t.indexOf(e)===-1)throw RangeError(`'fetches' contains invalid output name: ${e}.`);a[e]=null}if(typeof i==`object`&&i)o=i;else if(typeof i<`u`)throw TypeError(`'options' must be an object.`)}else{let e=!1,n=Object.getOwnPropertyNames(r);for(let i of t)if(n.indexOf(i)!==-1){let t=r[i];(t===null||t instanceof M)&&(e=!0,s=!1,a[i]=t)}if(e){if(typeof i==`object`&&i)o=i;else if(typeof i<`u`)throw TypeError(`'options' must be an object.`)}else o=r}}else if(typeof r<`u`)throw TypeError(`Unexpected argument[1]: must be 'fetches' or 'options'.`);for(let t of e)if(typeof n[t]>`u`)throw Error(`input '${t}' is missing in 'feeds'.`);if(s)for(let e of t)a[e]=null;return[a,o]}convertHandlerReturnTypeToMapOfTensors(e){let t={};for(let n in e)if(Object.hasOwnProperty.call(e,n)){let r=e[n];r instanceof M?t[n]=r:t[n]=new M(r.type,r.data,r.dims)}return t}async lazyResetGrad(){await this.handler.lazyResetGrad()}async runTrainStep(e,t,n){let[r,i]=this.typeNarrowingForRunStep(this.trainingInputNames,this.trainingOutputNames,e,t,n),a=await this.handler.runTrainStep(e,r,i);return this.convertHandlerReturnTypeToMapOfTensors(a)}async runOptimizerStep(e){if(this.hasOptimizerModel)await this.handler.runOptimizerStep(e||{});else throw Error(`This TrainingSession has no OptimizerModel loaded.`)}async runEvalStep(e,t,n){if(this.hasEvalModel){let[r,i]=this.typeNarrowingForRunStep(this.evalInputNames,this.evalOutputNames,e,t,n),a=await this.handler.runEvalStep(e,r,i);return this.convertHandlerReturnTypeToMapOfTensors(a)}else throw Error(`This TrainingSession has no EvalModel loaded.`)}async getParametersSize(e=!0){return this.handler.getParametersSize(e)}async loadParametersBuffer(e,t=!0){let n=await this.getParametersSize(t);if(e.length!==4*n)throw Error(`Size of the buffer passed into loadParametersBuffer must match the number of parameters in the model. Please use getParametersSize method to check.`);return this.handler.loadParametersBuffer(e,t)}async getContiguousParameters(e=!0){return this.handler.getContiguousParameters(e)}async release(){return this.handler.dispose()}}}),Me,Ne=l(()=>{je(),Me=Ae}),N={};u(N,{InferenceSession:()=>Ce,TRACE:()=>ge,TRACE_FUNC_BEGIN:()=>ve,TRACE_FUNC_END:()=>ye,Tensor:()=>M,TrainingSession:()=>Me,env:()=>T,registerBackend:()=>h});var Pe=l(()=>{y(),E(),we(),he(),Te(),Ee(),be(),De(),Oe(),Ne()}),Fe=l(()=>{}),Ie={};u(Ie,{default:()=>ze});var Le,Re,ze,Be=l(()=>{uu(),st(),et(),Le=`ort-wasm-proxy-worker`,Re=globalThis.self?.name===Le,Re&&(self.onmessage=e=>{let{type:t,in:n}=e.data;try{switch(t){case`init-wasm`:ot(n.wasm).then(()=>{$l(n).then(()=>{postMessage({type:t})},e=>{postMessage({type:t,err:e})})},e=>{postMessage({type:t,err:e})});break;case`init-ep`:{let{epName:e,env:r}=n;eu(r,e).then(()=>{postMessage({type:t})},e=>{postMessage({type:t,err:e})});break}case`copy-from`:{let{buffer:e}=n,r=ru(e);postMessage({type:t,out:r});break}case`create`:{let{model:e,options:r}=n;iu(e,r).then(e=>{postMessage({type:t,out:e})},e=>{postMessage({type:t,err:e})});break}case`release`:au(n),postMessage({type:t});break;case`run`:{let{sessionId:e,inputIndices:r,inputs:i,outputIndices:a,options:o}=n;su(e,r,i,a,Array(a.length).fill(null),o).then(e=>{e.some(e=>e[3]!==`cpu`)?postMessage({type:t,err:`Proxy does not support non-cpu tensor location.`}):postMessage({type:t,out:e},lu([...i,...e]))},e=>{postMessage({type:t,err:e})});break}case`end-profiling`:cu(n),postMessage({type:t});break;default:}}catch(e){postMessage({type:t,err:e})}}),ze=Re?null:e=>new Worker(e??Ke,{type:`module`,name:Le})}),Ve={};u(Ve,{default:()=>We});var He,Ue,We,Ge=l(()=>{Ue=(He=import.meta.url,async function(e={}){function t(){return A.buffer!=re.buffer&&j(),re}function n(){return A.buffer!=re.buffer&&j(),ie}function r(){return A.buffer!=re.buffer&&j(),ae}function i(){return A.buffer!=re.buffer&&j(),oe}function a(){return A.buffer!=re.buffer&&j(),se}function o(){return A.buffer!=re.buffer&&j(),ce}function s(){return A.buffer!=re.buffer&&j(),le}function c(){return A.buffer!=re.buffer&&j(),fe}var l,u,d=Object.assign({},e),f=new Promise((e,t)=>{l=e,u=t}),p=typeof window==`object`,m=typeof importScripts==`function`,h=m&&self.name==`em-pthread`;d.mountExternalData=(e,t)=>{e.startsWith(`./`)&&(e=e.substring(2)),(d.Fb||=new Map).set(e,t)},d.unmountExternalData=()=>{delete d.Fb};var g=globalThis.SharedArrayBuffer??new WebAssembly.Memory({initial:0,maximum:0,shared:!0}).buffer.constructor;let _=()=>{let e=(e,t,n)=>(...r)=>{let i=W,a=t?.();r=e(...r);let o=t?.();return a!==o&&(e=o,n(a),t=n=null),W==i?r:new Promise((e,t)=>{on={resolve:e,reject:t}})},t=e=>async(...t)=>{try{if(d.Eb)throw Error(`Session already started`);let n=d.Eb={fc:t[0],errors:[]},r=await e(...t);if(d.Eb!==n)throw Error(`Session mismatch`);d.Gb?.flush();let i=n.errors;if(0<i.length){let e=await Promise.all(i);if(e=e.filter(e=>e),0<e.length)throw Error(e.join(`
`))}return r}finally{d.Eb=null}};d._OrtCreateSession=e(d._OrtCreateSession,()=>d._OrtCreateSession,e=>d._OrtCreateSession=e),d._OrtRun=t(e(d._OrtRun,()=>d._OrtRun,e=>d._OrtRun=e)),d._OrtRunWithBinding=t(e(d._OrtRunWithBinding,()=>d._OrtRunWithBinding,e=>d._OrtRunWithBinding=e)),d._OrtBindInput=e(d._OrtBindInput,()=>d._OrtBindInput,e=>d._OrtBindInput=e),_=void 0};d.jsepInit=(e,t)=>{if(_?.(),e===`webgpu`){[d.Gb,d.Ub,d.Yb,d.Nb,d.Xb,d.jb,d.Zb,d.bc,d.Vb,d.Wb,d.$b]=t;let e=d.Gb;d.jsepRegisterBuffer=(t,n,r,i)=>e.registerBuffer(t,n,r,i),d.jsepGetBuffer=t=>e.getBuffer(t),d.jsepCreateDownloader=(t,n,r)=>e.createDownloader(t,n,r),d.jsepOnReleaseSession=t=>{e.onReleaseSession(t)},d.jsepOnRunStart=t=>e.onRunStart(t),d.cc=(t,n)=>{e.upload(t,n)}}else if(e===`webnn`){[d.Gb,d.ac,d.Ob,d.jsepEnsureTensor,d.dc,d.jsepDownloadTensor]=t,d.jsepReleaseTensorId=d.Ob;let e=d.Gb;d.jsepOnRunStart=t=>e.onRunStart(t),d.jsepRegisterMLContext=(t,n)=>{e.registerMLContext(t,n)},d.jsepOnReleaseSession=t=>{e.onReleaseSession(t)},d.jsepCreateMLTensorDownloader=(t,n)=>e.createMLTensorDownloader(t,n),d.jsepRegisterMLTensor=(t,n,r)=>e.registerMLTensor(t,n,r)}};var v,y,b=Object.assign({},d),x=`./this.program`,S=(e,t)=>{throw t},C=``;(p||m)&&(m?C=self.location.href:typeof document<`u`&&document.currentScript&&(C=document.currentScript.src),He&&(C=He),C=C.startsWith(`blob:`)?``:C.substr(0,C.replace(/[?#].*/,``).lastIndexOf(`/`)+1),m&&(y=e=>{var t=new XMLHttpRequest;return t.open(`GET`,e,!1),t.responseType=`arraybuffer`,t.send(null),new Uint8Array(t.response)}),v=(e,t,n)=>{var r=new XMLHttpRequest;r.open(`GET`,e,!0),r.responseType=`arraybuffer`,r.onload=()=>{r.status==200||r.status==0&&r.response?t(r.response):n()},r.onerror=n,r.send(null)});var w,T=console.log.bind(console),E=console.error.bind(console),D=T,O=E;if(Object.assign(d,b),b=null,h){let e=function(t){try{var n=t.data,r=n.cmd;if(r===`load`){let t=[];self.onmessage=e=>t.push(e),self.startWorker=()=>{postMessage({cmd:`loaded`});for(let n of t)e(n);self.onmessage=e};for(let e of n.handlers)d[e]&&!d[e].proxy||(d[e]=(...t)=>{postMessage({Mb:`callHandler`,oc:e,args:t})},e==`print`&&(D=d[e]),e==`printErr`&&(O=d[e]));A=n.wasmMemory,j(),k(n.wasmModule)}else if(r===`run`){wr(n.pthread_ptr,0,0,1,0,0),B(n.pthread_ptr),qe(),Ue(),ee||=(yr(),!0);try{Je(n.start_routine,n.arg)}catch(e){if(e!=`unwind`)throw e}}else r===`cancel`?xr()&&Or(-1):n.target!==`setimmediate`&&(r===`checkMailbox`?ee&&V():r&&(O(`worker: received unknown command ${r}`),O(n)))}catch(e){throw Tr(),e}};var k,ee=!1;O=function(...e){e=e.join(` `),console.error(e)},self.alert=function(...e){postMessage({Mb:`alert`,text:e.join(` `),qc:xr()})},d.instantiateWasm=(e,t)=>new Promise(e=>{k=n=>{n=new WebAssembly.Instance(n,Ee()),t(n),e()}}),self.onunhandledrejection=e=>{throw e.reason||e},self.onmessage=e}d.wasmBinary&&(w=d.wasmBinary);var A,te,ne,re,ie,ae,oe,se,ce,le,ue,de,fe,pe=!1;function j(){var e=A.buffer;d.HEAP8=re=new Int8Array(e),d.HEAP16=ae=new Int16Array(e),d.HEAPU8=ie=new Uint8Array(e),d.HEAPU16=oe=new Uint16Array(e),d.HEAP32=se=new Int32Array(e),d.HEAPU32=ce=new Uint32Array(e),d.HEAPF32=le=new Float32Array(e),d.HEAPF64=fe=new Float64Array(e),d.HEAP64=ue=new BigInt64Array(e),d.HEAPU64=de=new BigUint64Array(e)}if(!h){if(!((A=new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})).buffer instanceof g))throw O(`requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag`),Error(`bad memory`);j()}var me=[],M=[],he=[],ge=0,_e=null,ve=null;function ye(){if(--ge==0&&(_e!==null&&(clearInterval(_e),_e=null),ve)){var e=ve;ve=null,e()}}function be(e){throw O(e=`Aborted(`+e+`)`),pe=!0,ne=1,e=new WebAssembly.RuntimeError(e+`. Build with -sASSERTIONS for more info.`),u(e),e}var xe,Se=e=>e.startsWith(`data:application/octet-stream;base64,`),Ce=e=>e.startsWith(`file://`);function we(e){if(e==xe&&w)return new Uint8Array(w);if(y)return y(e);throw`both async and sync fetching of the wasm failed`}function Te(e,t,n){return function(e){if(!w&&(p||m)){if(typeof fetch==`function`&&!Ce(e))return fetch(e,{credentials:`same-origin`}).then(t=>{if(!t.ok)throw`failed to load wasm binary file at '${e}'`;return t.arrayBuffer()}).catch(()=>we(e));if(v)return new Promise((t,n)=>{v(e,e=>t(new Uint8Array(e)),n)})}return Promise.resolve().then(()=>we(e))}(e).then(e=>WebAssembly.instantiate(e,t)).then(n,e=>{O(`failed to asynchronously prepare wasm: ${e}`),be(e)})}function Ee(){return{a:{O:ke,Aa:Oe,b:Xe,aa:Qe,B:tt,qa:nt,Y:ot,_:F,ra:st,oa:I,ha:ct,na:L,L:lt,Z:ut,W:dt,pa:ft,X:pt,wa:gt,F:Ct,Q:Tt,P:Mt,E:z,u:Pt,q:Ft,G:It,A:Wt,R:Gt,ua:Kt,ka:qt,U:Yt,ba:H,H:Zt,ja:B,ta:Qt,t:U,x:Y,o:cn,l:dn,c:Dt,n:fn,j:gn,w:_n,p:vn,g:yn,s:bn,m:xn,e:Sn,k:Cn,i:wn,h:Tn,d:En,ea:Dn,fa:jn,ga:Mn,ca:Nn,da:Pn,T:Fn,f:Rn,D:zn,I:Bn,M:Vn,y:Hn,sa:Wn,V:Gn,v:Un,z:Kn,N:qn,S:Jn,za:Qn,ya:$n,la:rr,ma:ir,$:Ie,C:ar,K:or,ia:sr,J:lr,a:A,xa:Pe,va:pr,r:mr}}}var De={868340:(e,t,r,i,a)=>{if(d===void 0||!d.Fb)return 1;if((e=P(e>>>0)).startsWith(`./`)&&(e=e.substring(2)),!(e=d.Fb.get(e)))return 2;if(i>>>=0,(t>>>=0)+(r>>>=0)>e.byteLength)return 3;try{let o=e.subarray(t,t+r);switch(a){case 0:n().set(o,i>>>0);break;case 1:d.cc(i,o);break;default:return 4}return 0}catch{return 4}},869023:(e,t,r)=>{d.dc(e,n().subarray(t>>>0,t+r>>>0))},869086:()=>d.ac(),869127:e=>{d.Ob(e)},869163:()=>{d.Vb()},869194:()=>{d.Wb()},869223:()=>{d.$b()},869248:e=>d.Ub(e),869281:e=>d.Yb(e),869313:(e,t,n)=>{d.Nb(e,t,n,!0)},869352:(e,t,n)=>{d.Nb(e,t,n)},869385:()=>typeof wasmOffsetConverter<`u`,869442:e=>{d.jb(`Abs`,e,void 0)},869493:e=>{d.jb(`Neg`,e,void 0)},869544:e=>{d.jb(`Floor`,e,void 0)},869597:e=>{d.jb(`Ceil`,e,void 0)},869649:e=>{d.jb(`Reciprocal`,e,void 0)},869707:e=>{d.jb(`Sqrt`,e,void 0)},869759:e=>{d.jb(`Exp`,e,void 0)},869810:e=>{d.jb(`Erf`,e,void 0)},869861:e=>{d.jb(`Sigmoid`,e,void 0)},869916:(e,t,n)=>{d.jb(`HardSigmoid`,e,{alpha:t,beta:n})},869995:e=>{d.jb(`Log`,e,void 0)},870046:e=>{d.jb(`Sin`,e,void 0)},870097:e=>{d.jb(`Cos`,e,void 0)},870148:e=>{d.jb(`Tan`,e,void 0)},870199:e=>{d.jb(`Asin`,e,void 0)},870251:e=>{d.jb(`Acos`,e,void 0)},870303:e=>{d.jb(`Atan`,e,void 0)},870355:e=>{d.jb(`Sinh`,e,void 0)},870407:e=>{d.jb(`Cosh`,e,void 0)},870459:e=>{d.jb(`Asinh`,e,void 0)},870512:e=>{d.jb(`Acosh`,e,void 0)},870565:e=>{d.jb(`Atanh`,e,void 0)},870618:e=>{d.jb(`Tanh`,e,void 0)},870670:e=>{d.jb(`Not`,e,void 0)},870721:(e,t,n)=>{d.jb(`Clip`,e,{min:t,max:n})},870790:e=>{d.jb(`Clip`,e,void 0)},870842:(e,t)=>{d.jb(`Elu`,e,{alpha:t})},870900:e=>{d.jb(`Gelu`,e,void 0)},870952:e=>{d.jb(`Relu`,e,void 0)},871004:(e,t)=>{d.jb(`LeakyRelu`,e,{alpha:t})},871068:(e,t)=>{d.jb(`ThresholdedRelu`,e,{alpha:t})},871138:(e,t)=>{d.jb(`Cast`,e,{to:t})},871196:e=>{d.jb(`Add`,e,void 0)},871247:e=>{d.jb(`Sub`,e,void 0)},871298:e=>{d.jb(`Mul`,e,void 0)},871349:e=>{d.jb(`Div`,e,void 0)},871400:e=>{d.jb(`Pow`,e,void 0)},871451:e=>{d.jb(`Equal`,e,void 0)},871504:e=>{d.jb(`Greater`,e,void 0)},871559:e=>{d.jb(`GreaterOrEqual`,e,void 0)},871621:e=>{d.jb(`Less`,e,void 0)},871673:e=>{d.jb(`LessOrEqual`,e,void 0)},871732:(e,t,n,r,i)=>{d.jb(`ReduceMean`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},871891:(e,t,n,r,i)=>{d.jb(`ReduceMax`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872049:(e,t,n,r,i)=>{d.jb(`ReduceMin`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872207:(e,t,n,r,i)=>{d.jb(`ReduceProd`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872366:(e,t,n,r,i)=>{d.jb(`ReduceSum`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872524:(e,t,n,r,i)=>{d.jb(`ReduceL1`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872681:(e,t,n,r,i)=>{d.jb(`ReduceL2`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872838:(e,t,n,r,i)=>{d.jb(`ReduceLogSum`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},872999:(e,t,n,r,i)=>{d.jb(`ReduceSumSquare`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},873163:(e,t,n,r,i)=>{d.jb(`ReduceLogSumExp`,e,{keepDims:!!t,noopWithEmptyAxes:!!n,axes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},873327:e=>{d.jb(`Where`,e,void 0)},873380:(e,t,n)=>{d.jb(`Transpose`,e,{perm:t?Array.from(a().subarray(t>>>0,n>>>0)):[]})},873488:(e,t,n,r)=>{d.jb(`DepthToSpace`,e,{blocksize:t,mode:P(n),format:r?`NHWC`:`NCHW`})},873621:(e,t,n,r)=>{d.jb(`DepthToSpace`,e,{blocksize:t,mode:P(n),format:r?`NHWC`:`NCHW`})},873754:(e,n,r,i,o,s,c,l,u,f,p,m,h,g,_)=>{d.jb(`ConvTranspose`,e,{format:u?`NHWC`:`NCHW`,autoPad:n,dilations:[r],group:i,kernelShape:[o],pads:[s,c],strides:[l],wIsConst:()=>!!t()[f>>>0],outputPadding:p?Array.from(a().subarray(p>>>0,m>>>0)):[],outputShape:h?Array.from(a().subarray(h>>>0,g>>>0)):[],activation:P(_)})},874155:(e,n,r,i,o,s,c,l,u,f,p,m,h,g)=>{d.jb(`ConvTranspose`,e,{format:l?`NHWC`:`NCHW`,autoPad:n,dilations:Array.from(a().subarray(r>>>0,2+(r>>>0)>>>0)),group:i,kernelShape:Array.from(a().subarray(o>>>0,2+(o>>>0)>>>0)),pads:Array.from(a().subarray(s>>>0,4+(s>>>0)>>>0)),strides:Array.from(a().subarray(c>>>0,2+(c>>>0)>>>0)),wIsConst:()=>!!t()[u>>>0],outputPadding:f?Array.from(a().subarray(f>>>0,p>>>0)):[],outputShape:m?Array.from(a().subarray(m>>>0,h>>>0)):[],activation:P(g)})},874720:(e,n,r,i,o,s,c,l,u,f,p,m,h,g,_)=>{d.jb(`ConvTranspose`,e,{format:u?`NHWC`:`NCHW`,autoPad:n,dilations:[r],group:i,kernelShape:[o],pads:[s,c],strides:[l],wIsConst:()=>!!t()[f>>>0],outputPadding:p?Array.from(a().subarray(p>>>0,m>>>0)):[],outputShape:h?Array.from(a().subarray(h>>>0,g>>>0)):[],activation:P(_)})},875121:(e,n,r,i,o,s,c,l,u,f,p,m,h,g)=>{d.jb(`ConvTranspose`,e,{format:l?`NHWC`:`NCHW`,autoPad:n,dilations:Array.from(a().subarray(r>>>0,2+(r>>>0)>>>0)),group:i,kernelShape:Array.from(a().subarray(o>>>0,2+(o>>>0)>>>0)),pads:Array.from(a().subarray(s>>>0,4+(s>>>0)>>>0)),strides:Array.from(a().subarray(c>>>0,2+(c>>>0)>>>0)),wIsConst:()=>!!t()[u>>>0],outputPadding:f?Array.from(a().subarray(f>>>0,p>>>0)):[],outputShape:m?Array.from(a().subarray(m>>>0,h>>>0)):[],activation:P(g)})},875686:(e,t)=>{d.jb(`GlobalAveragePool`,e,{format:t?`NHWC`:`NCHW`})},875777:(e,t,n,r,i,o,s,c,l,u,f,p,m,h)=>{d.jb(`AveragePool`,e,{format:h?`NHWC`:`NCHW`,auto_pad:t,ceil_mode:n,count_include_pad:r,storage_order:i,dilations:o?Array.from(a().subarray(o>>>0,s>>>0)):[],kernel_shape:c?Array.from(a().subarray(c>>>0,l>>>0)):[],pads:u?Array.from(a().subarray(u>>>0,f>>>0)):[],strides:p?Array.from(a().subarray(p>>>0,m>>>0)):[]})},876192:(e,t)=>{d.jb(`GlobalAveragePool`,e,{format:t?`NHWC`:`NCHW`})},876283:(e,t,n,r,i,o,s,c,l,u,f,p,m,h)=>{d.jb(`AveragePool`,e,{format:h?`NHWC`:`NCHW`,auto_pad:t,ceil_mode:n,count_include_pad:r,storage_order:i,dilations:o?Array.from(a().subarray(o>>>0,s>>>0)):[],kernel_shape:c?Array.from(a().subarray(c>>>0,l>>>0)):[],pads:u?Array.from(a().subarray(u>>>0,f>>>0)):[],strides:p?Array.from(a().subarray(p>>>0,m>>>0)):[]})},876698:(e,t)=>{d.jb(`GlobalMaxPool`,e,{format:t?`NHWC`:`NCHW`})},876785:(e,t,n,r,i,o,s,c,l,u,f,p,m,h)=>{d.jb(`MaxPool`,e,{format:h?`NHWC`:`NCHW`,auto_pad:t,ceil_mode:n,count_include_pad:r,storage_order:i,dilations:o?Array.from(a().subarray(o>>>0,s>>>0)):[],kernel_shape:c?Array.from(a().subarray(c>>>0,l>>>0)):[],pads:u?Array.from(a().subarray(u>>>0,f>>>0)):[],strides:p?Array.from(a().subarray(p>>>0,m>>>0)):[]})},877196:(e,t)=>{d.jb(`GlobalMaxPool`,e,{format:t?`NHWC`:`NCHW`})},877283:(e,t,n,r,i,o,s,c,l,u,f,p,m,h)=>{d.jb(`MaxPool`,e,{format:h?`NHWC`:`NCHW`,auto_pad:t,ceil_mode:n,count_include_pad:r,storage_order:i,dilations:o?Array.from(a().subarray(o>>>0,s>>>0)):[],kernel_shape:c?Array.from(a().subarray(c>>>0,l>>>0)):[],pads:u?Array.from(a().subarray(u>>>0,f>>>0)):[],strides:p?Array.from(a().subarray(p>>>0,m>>>0)):[]})},877694:(e,t,n,r,i)=>{d.jb(`Gemm`,e,{alpha:t,beta:n,transA:r,transB:i})},877798:e=>{d.jb(`MatMul`,e,void 0)},877852:(e,t,n,r)=>{d.jb(`ArgMax`,e,{keepDims:!!t,selectLastIndex:!!n,axis:r})},877960:(e,t,n,r)=>{d.jb(`ArgMin`,e,{keepDims:!!t,selectLastIndex:!!n,axis:r})},878068:(e,t)=>{d.jb(`Softmax`,e,{axis:t})},878131:(e,t)=>{d.jb(`Concat`,e,{axis:t})},878191:(e,t,n,r,i)=>{d.jb(`Split`,e,{axis:t,numOutputs:n,splitSizes:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},878331:e=>{d.jb(`Expand`,e,void 0)},878385:(e,t)=>{d.jb(`Gather`,e,{axis:Number(t)})},878456:(e,t)=>{d.jb(`GatherElements`,e,{axis:Number(t)})},878535:(e,t,n,r,i,o,s,c,l,u,f)=>{d.jb(`Resize`,e,{antialias:t,axes:n?Array.from(a().subarray(n>>>0,r>>>0)):[],coordinateTransformMode:P(i),cubicCoeffA:o,excludeOutside:s,extrapolationValue:c,keepAspectRatioPolicy:P(l),mode:P(u),nearestMode:P(f)})},878881:(e,t,n,r,i,o,s)=>{d.jb(`Slice`,e,{starts:t?Array.from(a().subarray(t>>>0,n>>>0)):[],ends:r?Array.from(a().subarray(r>>>0,i>>>0)):[],axes:o?Array.from(a().subarray(o>>>0,s>>>0)):[]})},879097:e=>{d.jb(`Tile`,e,void 0)},879149:(e,t,n)=>{d.jb(`InstanceNormalization`,e,{epsilon:t,format:n?`NHWC`:`NCHW`})},879263:(e,t,n)=>{d.jb(`InstanceNormalization`,e,{epsilon:t,format:n?`NHWC`:`NCHW`})},879377:e=>{d.jb(`Range`,e,void 0)},879430:(e,t)=>{d.jb(`Einsum`,e,{equation:P(t)})},879511:(e,t,n,r,i)=>{d.jb(`Pad`,e,{mode:t,value:n,pads:r?Array.from(a().subarray(r>>>0,i>>>0)):[]})},879638:(e,t,n,r,i,a)=>{d.jb(`BatchNormalization`,e,{epsilon:t,momentum:n,spatial:!!i,trainingMode:!!r,format:a?`NHWC`:`NCHW`})},879807:(e,t,n,r,i,a)=>{d.jb(`BatchNormalization`,e,{epsilon:t,momentum:n,spatial:!!i,trainingMode:!!r,format:a?`NHWC`:`NCHW`})},879976:(e,t,n)=>{d.jb(`CumSum`,e,{exclusive:Number(t),reverse:Number(n)})},880073:(e,t,n)=>{d.jb(`DequantizeLinear`,e,{axis:t,blockSize:n})},880163:(e,t,n,r,i,o,s,c,l)=>{d.jb(`Attention`,e,{numHeads:t,isUnidirectional:n,maskFilterValue:r,scale:i,doRotary:o,qkvHiddenSizes:s?Array.from(a().subarray(Number(c)>>>0,Number(c)+s>>>0)):[],pastPresentShareBuffer:!!l})},880435:e=>{d.jb(`BiasAdd`,e,void 0)},880490:e=>{d.jb(`BiasSplitGelu`,e,void 0)},880551:e=>{d.jb(`FastGelu`,e,void 0)},880607:(e,n,r,i,o,c,l,u,f,p,m,h,g,_,v,y)=>{d.jb(`Conv`,e,{format:h?`NHWC`:`NCHW`,auto_pad:n,dilations:r?Array.from(a().subarray(r>>>0,i>>>0)):[],group:o,kernel_shape:c?Array.from(a().subarray(c>>>0,l>>>0)):[],pads:u?Array.from(a().subarray(u>>>0,f>>>0)):[],strides:p?Array.from(a().subarray(p>>>0,m>>>0)):[],w_is_const:()=>!!t()[g>>>0],activation:P(_),activation_params:v?Array.from(s().subarray(v>>>0,y>>>0)):[]})},881103:e=>{d.jb(`Gelu`,e,void 0)},881155:(e,t,n,r)=>{d.jb(`GroupQueryAttention`,e,{numHeads:t,kvNumHeads:n,scale:r})},881268:(e,t,n,r)=>{d.jb(`LayerNormalization`,e,{axis:t,epsilon:n,simplified:!!r})},881379:(e,t,n,r)=>{d.jb(`LayerNormalization`,e,{axis:t,epsilon:n,simplified:!!r})},881490:(e,t,n,r,i,a)=>{d.jb(`MatMulNBits`,e,{k:t,n,accuracyLevel:r,bits:i,blockSize:a})},881617:(e,t,n,r,i,a)=>{d.jb(`MultiHeadAttention`,e,{numHeads:t,isUnidirectional:n,maskFilterValue:r,scale:i,doRotary:a})},881776:(e,t)=>{d.jb(`QuickGelu`,e,{alpha:t})},881840:(e,t,n,r,i)=>{d.jb(`RotaryEmbedding`,e,{interleaved:!!t,numHeads:n,rotaryEmbeddingDim:r,scale:i})},881979:(e,t,n)=>{d.jb(`SkipLayerNormalization`,e,{epsilon:t,simplified:!!n})},882081:(e,t,n)=>{d.jb(`SkipLayerNormalization`,e,{epsilon:t,simplified:!!n})},882183:(e,t,n,r)=>{d.jb(`GatherBlockQuantized`,e,{gatherAxis:t,quantizeAxis:n,blockSize:r})},882304:e=>{d.Zb(e)},882338:(e,t)=>d.bc(e,t,d.Eb.fc,d.Eb.errors)};function Oe(e,t,n){return sn(async()=>{await d.Xb(e,t,n)})}function ke(){return typeof wasmOffsetConverter<`u`}function Ae(e){this.name=`ExitStatus`,this.message=`Program terminated with exit(${e})`,this.status=e}var je=e=>{e.terminate(),e.onmessage=()=>{}},Me=e=>{Le.length==0&&(Ge(),We(Le[0]));var t=Le.pop();if(!t)return 6;Re.push(t),Be[e.Ab]=t,t.Ab=e.Ab;var n={cmd:`run`,start_routine:e.hc,arg:e.Qb,pthread_ptr:e.Ab};return t.postMessage(n,e.mc),0},Ne=0,N=(e,t,...n)=>{for(var r=2*n.length,i=Nr(),a=Mr(8*r),o=a>>>3,s=0;s<n.length;s++){var l=n[s];typeof l==`bigint`?(ue[o+2*s]=1n,ue[o+2*s+1]=l):(ue[o+2*s]=0n,c()[o+2*s+1>>>0]=l)}return e=Er(e,0,r,a,t),jr(i),e};function Pe(e){if(h)return N(0,1,e);if(ne=e,!(0<Ne)){for(var t of Re)je(t);for(t of Le)je(t);Le=[],Re=[],Be=[],pe=!0}S(e,new Ae(e))}function Fe(e){if(h)return N(1,0,e);Ie(e)}var Ie=e=>{if(ne=e,h)throw Fe(e),`unwind`;Pe(e)},Le=[],Re=[],ze=[],Be={},Ve=e=>{var t=e.Ab;delete Be[t],Le.push(e),Re.splice(Re.indexOf(e),1),e.Ab=0,Dr(t)};function Ue(){ze.forEach(e=>e())}var We=e=>new Promise(t=>{e.onmessage=n=>{var r=(n=n.data).cmd;if(n.targetThread&&n.targetThread!=xr()){var i=Be[n.targetThread];i?i.postMessage(n,n.transferList):O(`Internal error! Worker sent a message "${r}" to target pthread ${n.targetThread}, but that thread no longer exists!`)}else r===`checkMailbox`?V():r===`spawnThread`?Me(n):r===`cleanupThread`?Ve(Be[n.thread]):r===`killThread`?(n=n.thread,r=Be[n],delete Be[n],je(r),Dr(n),Re.splice(Re.indexOf(r),1),r.Ab=0):r===`cancelThread`?Be[n.thread].postMessage({cmd:`cancel`}):r===`loaded`?(e.loaded=!0,t(e)):r===`alert`?alert(`Thread ${n.threadId}: ${n.text}`):n.target===`setimmediate`?e.postMessage(n):r===`callHandler`?d[n.handler](...n.args):r&&O(`worker sent an unknown command ${r}`)},e.onerror=e=>{throw O(`worker sent an error! ${e.filename}:${e.lineno}: ${e.message}`),e};var n,r=[];for(n of[])d.hasOwnProperty(n)&&r.push(n);e.postMessage({cmd:`load`,handlers:r,wasmMemory:A,wasmModule:te})});function Ge(){var e=new Worker(new URL(import.meta.url),{type:`module`,workerData:`em-pthread`,name:`em-pthread`});Le.push(e)}var Ke=e=>{for(;0<e.length;)e.shift()(d)},qe=()=>{var e=xr(),t=o()[e+52>>>2>>>0];e=o()[e+56>>>2>>>0],Ar(t,t-e),jr(t)},Je=(e,t)=>{Ne=0,e=Pr(e,t),0<Ne?ne=e:Or(e)};class Ye{constructor(e){this.Jb=e-24}}function Xe(e,t,n){var r=new Ye(e>>>=0);throw t>>>=0,n>>>=0,o()[r.Jb+16>>>2>>>0]=0,o()[r.Jb+4>>>2>>>0]=t,o()[r.Jb+8>>>2>>>0]=n,e}function Ze(e,t,n,r){return h?N(2,1,e,t,n,r):Qe(e,t,n,r)}function Qe(e,t,n,r){if(e>>>=0,t>>>=0,n>>>=0,r>>>=0,g===void 0)return O(`Current environment does not support SharedArrayBuffer, pthreads are not available!`),6;var i=[];return h&&i.length===0?Ze(e,t,n,r):(e={hc:n,Ab:e,Qb:r,mc:i},h?(e.Mb=`spawnThread`,postMessage(e,i),0):Me(e))}var $e=typeof TextDecoder<`u`?new TextDecoder(`utf8`):void 0,et=(e,t,n)=>{var r=(t>>>=0)+n;for(n=t;e[n]&&!(n>=r);)++n;if(16<n-t&&e.buffer&&$e)return $e.decode(e.buffer instanceof g?e.slice(t,n):e.subarray(t,n));for(r=``;t<n;){var i=e[t++];if(128&i){var a=63&e[t++];if((224&i)==192)r+=String.fromCharCode((31&i)<<6|a);else{var o=63&e[t++];65536>(i=(240&i)==224?(15&i)<<12|a<<6|o:(7&i)<<18|a<<12|o<<6|63&e[t++])?r+=String.fromCharCode(i):(i-=65536,r+=String.fromCharCode(55296|i>>10,56320|1023&i))}}else r+=String.fromCharCode(i)}return r},P=(e,t)=>(e>>>=0)?et(n(),e,t):``;function tt(e,t,n){return h?N(3,1,e,t,n):0}function nt(e,t){if(h)return N(4,1,e,t)}var rt=e=>{for(var t=0,n=0;n<e.length;++n){var r=e.charCodeAt(n);127>=r?t++:2047>=r?t+=2:55296<=r&&57343>=r?(t+=4,++n):t+=3}return t},it=(e,t,n,r)=>{if(!(0<r))return 0;var i=n>>>=0;r=n+r-1;for(var a=0;a<e.length;++a){var o=e.charCodeAt(a);if(55296<=o&&57343>=o&&(o=65536+((1023&o)<<10)|1023&e.charCodeAt(++a)),127>=o){if(n>=r)break;t[n++>>>0]=o}else{if(2047>=o){if(n+1>=r)break;t[n++>>>0]=192|o>>6}else{if(65535>=o){if(n+2>=r)break;t[n++>>>0]=224|o>>12}else{if(n+3>=r)break;t[n++>>>0]=240|o>>18,t[n++>>>0]=128|o>>12&63}t[n++>>>0]=128|o>>6&63}t[n++>>>0]=128|63&o}}return t[n>>>0]=0,n-i},at=(e,t,r)=>it(e,n(),t,r);function ot(e,t){if(h)return N(5,1,e,t)}function F(e,t,n){if(h)return N(6,1,e,t,n)}function st(e,t,n){return h?N(7,1,e,t,n):0}function I(e,t){if(h)return N(8,1,e,t)}function ct(e,t,n){if(h)return N(9,1,e,t,n)}function L(e,t,n,r){if(h)return N(10,1,e,t,n,r)}function lt(e,t,n,r){if(h)return N(11,1,e,t,n,r)}function ut(e,t,n,r){if(h)return N(12,1,e,t,n,r)}function dt(e){if(h)return N(13,1,e)}function ft(e,t){if(h)return N(14,1,e,t)}function pt(e,t,n){if(h)return N(15,1,e,t,n)}var mt,ht,gt=()=>{be(``)},_t=e=>{for(var t=``;n()[e>>>0];)t+=mt[n()[e++>>>0]];return t},vt={},yt={},bt={};function xt(e,t,n={}){if(!(`argPackAdvance`in t))throw TypeError(`registerType registeredInstance requires argPackAdvance`);return function(e,t,n={}){var r=t.name;if(!e)throw new ht(`type "${r}" must have a positive integer typeid pointer`);if(yt.hasOwnProperty(e)){if(n.Sb)return;throw new ht(`Cannot register type '${r}' twice`)}yt[e]=t,delete bt[e],vt.hasOwnProperty(e)&&(t=vt[e],delete vt[e],t.forEach(e=>e()))}(e,t,n)}var St=(e,s,c)=>{switch(s){case 1:return c?e=>t()[e>>>0]:e=>n()[e>>>0];case 2:return c?e=>r()[e>>>1>>>0]:e=>i()[e>>>1>>>0];case 4:return c?e=>a()[e>>>2>>>0]:e=>o()[e>>>2>>>0];case 8:return c?e=>ue[e>>>3]:e=>de[e>>>3];default:throw TypeError(`invalid integer width (${s}): ${e}`)}};function Ct(e,t,n){n>>>=0,xt(e>>>=0,{name:t=_t(t>>>0),fromWireType:e=>e,toWireType:function(e,t){if(typeof t!=`bigint`&&typeof t!=`number`)throw t=t===null?`null`:(e=typeof t)==`object`||e===`array`||e===`function`?t.toString():``+t,TypeError(`Cannot convert "${t}" to ${this.name}`);return typeof t==`number`&&(t=BigInt(t)),t},argPackAdvance:wt,readValueFromPointer:St(t,n,t.indexOf(`u`)==-1),Db:null})}var wt=8;function Tt(e,t,r,i){xt(e>>>=0,{name:t=_t(t>>>0),fromWireType:function(e){return!!e},toWireType:function(e,t){return t?r:i},argPackAdvance:wt,readValueFromPointer:function(e){return this.fromWireType(n()[e>>>0])},Db:null})}var R=[],Et=[];function Dt(e){9<(e>>>=0)&&--Et[e+1]==0&&(Et[e]=void 0,R.push(e))}var Ot=e=>{if(!e)throw new ht(`Cannot use deleted val. handle = `+e);return Et[e]},kt=e=>{switch(e){case void 0:return 2;case null:return 4;case!0:return 6;case!1:return 8;default:let t=R.pop()||Et.length;return Et[t]=e,Et[t+1]=1,t}};function At(e){return this.fromWireType(o()[e>>>2>>>0])}var jt={name:`emscripten::val`,fromWireType:e=>{var t=Ot(e);return Dt(e),t},toWireType:(e,t)=>kt(t),argPackAdvance:wt,readValueFromPointer:At,Db:null};function Mt(e){return xt(e>>>0,jt)}var Nt=(e,t)=>{switch(t){case 4:return function(e){return this.fromWireType(s()[e>>>2>>>0])};case 8:return function(e){return this.fromWireType(c()[e>>>3>>>0])};default:throw TypeError(`invalid float width (${t}): ${e}`)}};function z(e,t,n){n>>>=0,xt(e>>>=0,{name:t=_t(t>>>0),fromWireType:e=>e,toWireType:(e,t)=>t,argPackAdvance:wt,readValueFromPointer:Nt(t,n),Db:null})}function Pt(e,t,n,r,i){if(e>>>=0,n>>>=0,t=_t(t>>>0),i===-1&&(i=4294967295),i=e=>e,r===0){var a=32-8*n;i=e=>e<<a>>>a}var o=t.includes(`unsigned`)?function(e,t){return t>>>0}:function(e,t){return t};xt(e,{name:t,fromWireType:i,toWireType:o,argPackAdvance:wt,readValueFromPointer:St(t,n,r!==0),Db:null})}function Ft(e,n,r){function i(e){var n=o()[e>>>2>>>0];return e=o()[e+4>>>2>>>0],new a(t().buffer,e,n)}var a=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array][n];xt(e>>>=0,{name:r=_t(r>>>0),fromWireType:i,argPackAdvance:wt,readValueFromPointer:i},{Sb:!0})}function It(e,t){e>>>=0;var r=(t=_t(t>>>0))===`std::string`;xt(e,{name:t,fromWireType:function(e){var t=o()[e>>>2>>>0],i=e+4;if(r)for(var a=i,s=0;s<=t;++s){var c=i+s;if(s==t||n()[c>>>0]==0){if(a=P(a,c-a),l===void 0)var l=a;else l+=`\0`,l+=a;a=c+1}}else{for(l=Array(t),s=0;s<t;++s)l[s]=String.fromCharCode(n()[i+s>>>0]);l=l.join(``)}return Cr(e),l},toWireType:function(e,t){t instanceof ArrayBuffer&&(t=new Uint8Array(t));var i=typeof t==`string`;if(!(i||t instanceof Uint8Array||t instanceof Uint8ClampedArray||t instanceof Int8Array))throw new ht(`Cannot pass non-string to std::string`);var a=r&&i?rt(t):t.length,s=Sr(4+a+1),c=s+4;if(o()[s>>>2>>>0]=a,r&&i)at(t,c,a+1);else if(i)for(i=0;i<a;++i){var l=t.charCodeAt(i);if(255<l)throw Cr(c),new ht(`String has UTF-16 code units that do not fit in 8 bits`);n()[c+i>>>0]=l}else for(i=0;i<a;++i)n()[c+i>>>0]=t[i];return e!==null&&e.push(Cr,s),s},argPackAdvance:wt,readValueFromPointer:At,Db(e){Cr(e)}})}var Lt=typeof TextDecoder<`u`?new TextDecoder(`utf-16le`):void 0,Rt=(e,t)=>{for(var a=e>>1,o=a+t/2;!(a>=o)&&i()[a>>>0];)++a;if(32<(a<<=1)-e&&Lt)return Lt.decode(n().slice(e,a));for(a=``,o=0;!(o>=t/2);++o){var s=r()[e+2*o>>>1>>>0];if(s==0)break;a+=String.fromCharCode(s)}return a},zt=(e,t,n)=>{if(n??=2147483647,2>n)return 0;var i=t;n=(n-=2)<2*e.length?n/2:e.length;for(var a=0;a<n;++a){var o=e.charCodeAt(a);r()[t>>>1>>>0]=o,t+=2}return r()[t>>>1>>>0]=0,t-i},Bt=e=>2*e.length,Vt=(e,t)=>{for(var n=0,r=``;!(n>=t/4);){var i=a()[e+4*n>>>2>>>0];if(i==0)break;++n,65536<=i?(i-=65536,r+=String.fromCharCode(55296|i>>10,56320|1023&i)):r+=String.fromCharCode(i)}return r},Ht=(e,t,n)=>{if(t>>>=0,n??=2147483647,4>n)return 0;var r=t;n=r+n-4;for(var i=0;i<e.length;++i){var o=e.charCodeAt(i);if(55296<=o&&57343>=o&&(o=65536+((1023&o)<<10)|1023&e.charCodeAt(++i)),a()[t>>>2>>>0]=o,(t+=4)+4>n)break}return a()[t>>>2>>>0]=0,t-r},Ut=e=>{for(var t=0,n=0;n<e.length;++n){var r=e.charCodeAt(n);55296<=r&&57343>=r&&++n,t+=4}return t};function Wt(e,t,n){if(e>>>=0,t>>>=0,n=_t(n>>>=0),t===2)var r=Rt,a=zt,s=Bt,c=e=>i()[e>>>1>>>0];else t===4&&(r=Vt,a=Ht,s=Ut,c=e=>o()[e>>>2>>>0]);xt(e,{name:n,fromWireType:e=>{for(var n,i=o()[e>>>2>>>0],a=e+4,s=0;s<=i;++s){var l=e+4+s*t;s!=i&&c(l)!=0||(a=r(a,l-a),n===void 0?n=a:(n+=`\0`,n+=a),a=l+t)}return Cr(e),n},toWireType:(e,r)=>{if(typeof r!=`string`)throw new ht(`Cannot pass non-string to C++ string type ${n}`);var i=s(r),c=Sr(4+i+t);return o()[c>>>2>>>0]=i/t,a(r,c+4,i+t),e!==null&&e.push(Cr,c),c},argPackAdvance:wt,readValueFromPointer:At,Db(e){Cr(e)}})}function Gt(e,t){xt(e>>>=0,{Tb:!0,name:t=_t(t>>>0),argPackAdvance:0,fromWireType:()=>{},toWireType:()=>{}})}var Kt=()=>1;function qt(e){wr(e>>>0,!m,1,!p,131072,!1),Ue()}var Jt=e=>{if(!pe)try{if(e(),!(0<Ne))try{h?Or(ne):Ie(ne)}catch(e){e instanceof Ae||e==`unwind`||S(1,e)}}catch(e){e instanceof Ae||e==`unwind`||S(1,e)}};function B(e){e>>>=0,typeof Atomics.nc==`function`&&(Atomics.nc(a(),e>>>2,e).value.then(V),e+=128,Atomics.store(a(),e>>>2,1))}var V=()=>{var e=xr();e&&(B(e),Jt(kr))};function Yt(e,t){(e>>>=0)==t>>>0?setTimeout(V):h?postMessage({targetThread:e,cmd:`checkMailbox`}):(e=Be[e])&&e.postMessage({cmd:`checkMailbox`})}var Xt=[];function H(e,t,n,r,i){for(t>>>=0,r/=2,Xt.length=r,n=i>>>0>>>3,i=0;i<r;i++)Xt[i]=ue[n+2*i]?ue[n+2*i+1]:c()[n+2*i+1>>>0];return(t?De[t]:_r[e])(...Xt)}function Zt(e){e>>>=0,h?postMessage({cmd:`cleanupThread`,thread:e}):Ve(Be[e])}function Qt(e){}var $t=(e,t)=>{var n=yt[e];if(n===void 0)throw e=vr(e),n=_t(e),Cr(e),new ht(`${t} has unknown type ${n}`);return n},en=(e,t,n)=>{var r=[];return e=e.toWireType(r,n),r.length&&(o()[t>>>2>>>0]=kt(r)),e};function U(e,t,n){return t>>>=0,n>>>=0,e=Ot(e>>>0),t=$t(t,`emval::as`),en(t,n,e)}var tn=e=>{try{e()}catch(e){be(e)}},nn=0,W=null,G=0,K=[],q={},rn={},an=0,on=null,J=[];function sn(e){return function(e){if(!pe){if(nn===0){var t=!1,n=!1;e((e=0)=>{if(!pe&&(G=e,t=!0,n)){nn=2,tn(()=>Lr(W)),typeof Browser<`u`&&Browser.Kb.Rb&&Browser.Kb.resume(),e=!1;try{var r=function(){var e=a()[W+8>>>2>>>0];return e=Q[rn[e]],--Ne,e()}()}catch(t){r=t,e=!0}var i=!1;if(!W){var o=on;o&&(on=null,(e?o.reject:o.resolve)(r),i=!0)}if(e&&!i)throw r}}),n=!0,t||(nn=1,W=function(){var e=Sr(65548),t=e+12;o()[e>>>2>>>0]=t,o()[e+4>>>2>>>0]=t+65536,t=K[0];var n=q[t];return n===void 0&&(n=an++,q[t]=n,rn[n]=t),t=n,a()[e+8>>>2>>>0]=t,e}(),typeof Browser<`u`&&Browser.Kb.Rb&&Browser.Kb.pause(),tn(()=>Fr(W)))}else nn===2?(nn=0,tn($),Cr(W),W=null,J.forEach(Jt)):be(`invalid state: ${nn}`);return G}}(t=>{e().then(t)})}function Y(e){return e>>>=0,sn(()=>(e=Ot(e)).then(kt))}var X=[];function cn(e,t,n,r){return n>>>=0,r>>>=0,(e=X[e>>>0])(null,t=Ot(t>>>0),n,r)}var ln={},un=e=>{var t=ln[e];return t===void 0?_t(e):t};function dn(e,t,n,r,i){return n>>>=0,r>>>=0,i>>>=0,(e=X[e>>>0])(t=Ot(t>>>0),t[n=un(n)],r,i)}var Z=()=>typeof globalThis==`object`?globalThis:Function(`return this`)();function fn(e){return(e>>>=0)==0?kt(Z()):(e=un(e),kt(Z()[e]))}var pn=e=>{var t=X.length;return X.push(e),t},mn=(e,t)=>{for(var n=Array(e),r=0;r<e;++r)n[r]=$t(o()[t+4*r>>>2>>>0],`parameter `+r);return n},hn=(e,t)=>Object.defineProperty(t,`name`,{value:e});function gn(e,t,n){var r=(t=mn(e,t>>>0)).shift();e--;var i=`return function (obj, func, destructorsRef, args) {
`,a=0,o=[];n===0&&o.push(`obj`);for(var s=[`retType`],c=[r],l=0;l<e;++l)o.push(`arg`+l),s.push(`argType`+l),c.push(t[l]),i+=`  var arg${l} = argType${l}.readValueFromPointer(args${a?`+`+a:``});
`,a+=t[l].argPackAdvance;return i+=`  var rv = ${n===1?`new func`:`func.call`}(${o.join(`, `)});
`,r.Tb||(s.push(`emval_returnValue`),c.push(en),i+=`  return emval_returnValue(retType, destructorsRef, rv);
`),s.push(i+`};
`),e=function(e){var t=Function;if(!(t instanceof Function))throw TypeError(`new_ called with constructor type ${typeof t} which is not a function`);var n=hn(t.name||`unknownFunctionName`,function(){});return n.prototype=t.prototype,n=new n,(e=t.apply(n,e))instanceof Object?e:n}(s)(...c),n=`methodCaller<(${t.map(e=>e.name).join(`, `)}) => ${r.name}>`,pn(hn(n,e))}function _n(e){return e=un(e>>>0),kt(d[e])}function vn(e,t){return t>>>=0,e=Ot(e>>>0),t=Ot(t),kt(e[t])}function yn(e){9<(e>>>=0)&&(Et[e+1]+=1)}function bn(){return kt([])}function xn(e){e=Ot(e>>>0);for(var t=Array(e.length),n=0;n<e.length;n++)t[n]=e[n];return kt(t)}function Sn(e){return kt(un(e>>>0))}function Cn(){return kt({})}function wn(e){for(var t=Ot(e>>>=0);t.length;){var n=t.pop();t.pop()(n)}Dt(e)}function Tn(e,t,n){t>>>=0,n>>>=0,e=Ot(e>>>0),t=Ot(t),n=Ot(n),e[t]=n}function En(e,t){return t>>>=0,e=(e=$t(e>>>0,`_emval_take_value`)).readValueFromPointer(t),kt(e)}function Dn(e,t){e=-9007199254740992>e||9007199254740992<e?NaN:Number(e),t>>>=0,e=new Date(1e3*e),a()[t>>>2>>>0]=e.getUTCSeconds(),a()[t+4>>>2>>>0]=e.getUTCMinutes(),a()[t+8>>>2>>>0]=e.getUTCHours(),a()[t+12>>>2>>>0]=e.getUTCDate(),a()[t+16>>>2>>>0]=e.getUTCMonth(),a()[t+20>>>2>>>0]=e.getUTCFullYear()-1900,a()[t+24>>>2>>>0]=e.getUTCDay(),e=(e.getTime()-Date.UTC(e.getUTCFullYear(),0,1,0,0,0,0))/864e5|0,a()[t+28>>>2>>>0]=e}var On=e=>e%4==0&&(e%100!=0||e%400==0),kn=[0,31,60,91,121,152,182,213,244,274,305,335],An=[0,31,59,90,120,151,181,212,243,273,304,334];function jn(e,t){e=-9007199254740992>e||9007199254740992<e?NaN:Number(e),t>>>=0,e=new Date(1e3*e),a()[t>>>2>>>0]=e.getSeconds(),a()[t+4>>>2>>>0]=e.getMinutes(),a()[t+8>>>2>>>0]=e.getHours(),a()[t+12>>>2>>>0]=e.getDate(),a()[t+16>>>2>>>0]=e.getMonth(),a()[t+20>>>2>>>0]=e.getFullYear()-1900,a()[t+24>>>2>>>0]=e.getDay();var n=(On(e.getFullYear())?kn:An)[e.getMonth()]+e.getDate()-1|0;a()[t+28>>>2>>>0]=n,a()[t+36>>>2>>>0]=-60*e.getTimezoneOffset(),n=new Date(e.getFullYear(),6,1).getTimezoneOffset();var r=new Date(e.getFullYear(),0,1).getTimezoneOffset();e=0|(n!=r&&e.getTimezoneOffset()==Math.min(r,n)),a()[t+32>>>2>>>0]=e}function Mn(e){e>>>=0;var t=new Date(a()[e+20>>>2>>>0]+1900,a()[e+16>>>2>>>0],a()[e+12>>>2>>>0],a()[e+8>>>2>>>0],a()[e+4>>>2>>>0],a()[e>>>2>>>0],0),n=a()[e+32>>>2>>>0],r=t.getTimezoneOffset(),i=new Date(t.getFullYear(),6,1).getTimezoneOffset(),o=new Date(t.getFullYear(),0,1).getTimezoneOffset(),s=Math.min(o,i);return 0>n?a()[e+32>>>2>>>0]=+(i!=o&&s==r):0<n!=(s==r)&&(i=Math.max(o,i),t.setTime(t.getTime()+6e4*((0<n?s:i)-r))),a()[e+24>>>2>>>0]=t.getDay(),n=(On(t.getFullYear())?kn:An)[t.getMonth()]+t.getDate()-1|0,a()[e+28>>>2>>>0]=n,a()[e>>>2>>>0]=t.getSeconds(),a()[e+4>>>2>>>0]=t.getMinutes(),a()[e+8>>>2>>>0]=t.getHours(),a()[e+12>>>2>>>0]=t.getDate(),a()[e+16>>>2>>>0]=t.getMonth(),a()[e+20>>>2>>>0]=t.getYear(),e=t.getTime(),BigInt(isNaN(e)?-1:e/1e3)}function Nn(e,t,n,r,i,a,o){return h?N(16,1,e,t,n,r,i,a,o):-52}function Pn(e,t,n,r,i,a){if(h)return N(17,1,e,t,n,r,i,a)}function Fn(e,t,n,r){e>>>=0,t>>>=0,n>>>=0,r>>>=0;var i=new Date().getFullYear(),s=new Date(i,0,1),c=new Date(i,6,1);i=s.getTimezoneOffset();var l=c.getTimezoneOffset(),u=Math.max(i,l);o()[e>>>2>>>0]=60*u,a()[t>>>2>>>0]=+(i!=l),s=(e=e=>e.toLocaleTimeString(void 0,{hour12:!1,timeZoneName:`short`}).split(` `)[1])(s),c=e(c),l<i?(at(s,n,17),at(c,r,17)):(at(s,r,17),at(c,n,17))}var In=[],Ln=(e,t)=>{In.length=0;for(var r;r=n()[e++>>>0];){var i=r!=105;t+=(i&=r!=112)&&t%8?4:0,In.push(r==112?o()[t>>>2>>>0]:r==106?ue[t>>>3]:r==105?a()[t>>>2>>>0]:c()[t>>>3>>>0]),t+=i?8:4}return In};function Rn(e,t,n){return e>>>=0,t=Ln(t>>>0,n>>>0),De[e](...t)}function zn(e,t,n){return e>>>=0,t=Ln(t>>>0,n>>>0),De[e](...t)}var Bn=()=>{},Vn=()=>Date.now();function Hn(e,t){return O(P(e>>>0,t>>>0))}var Un,Wn=()=>{throw Ne+=1,`unwind`};function Gn(){return 4294901760}Un=()=>performance.timeOrigin+performance.now();var Kn=()=>navigator.hardwareConcurrency;function qn(){return be(`Cannot use emscripten_pc_get_function without -sUSE_OFFSET_CONVERTER`),0}function Jn(e){e>>>=0;var t=n().length;if(e<=t||4294901760<e)return!1;for(var r=1;4>=r;r*=2){var i=t*(1+.2/r);i=Math.min(i,e+100663296);var a=Math;i=Math.max(e,i);e:{a=(a.min.call(a,4294901760,i+(65536-i%65536)%65536)-A.buffer.byteLength+65535)/65536;try{A.grow(a),j();var o=1;break e}catch{}o=void 0}if(o)return!0}return!1}var Yn=()=>(be(`Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER`),0),Xn={},Zn=e=>{e.forEach(e=>{var t=Yn();t&&(Xn[t]=e)})};function Qn(){var e=Error().stack.toString().split(`
`);return e[0]==`Error`&&e.shift(),Zn(e),Xn.Pb=Yn(),Xn.ec=e,Xn.Pb}function $n(e,t,n){if(e>>>=0,t>>>=0,Xn.Pb==e)var r=Xn.ec;else (r=Error().stack.toString().split(`
`))[0]==`Error`&&r.shift(),Zn(r);for(var i=3;r[i]&&Yn()!=e;)++i;for(e=0;e<n&&r[e+i];++e)a()[t+4*e>>>2>>>0]=Yn();return e}var er,tr={},nr=()=>{if(!er){var e,t={USER:`web_user`,LOGNAME:`web_user`,PATH:`/`,PWD:`/`,HOME:`/home/web_user`,LANG:(typeof navigator==`object`&&navigator.languages&&navigator.languages[0]||`C`).replace(`-`,`_`)+`.UTF-8`,_:x||`./this.program`};for(e in tr)tr[e]===void 0?delete t[e]:t[e]=tr[e];var n=[];for(e in t)n.push(`${e}=${t[e]}`);er=n}return er};function rr(e,n){if(h)return N(18,1,e,n);e>>>=0,n>>>=0;var r=0;return nr().forEach((i,a)=>{var s=n+r;for(a=o()[e+4*a>>>2>>>0]=s,s=0;s<i.length;++s)t()[a++>>>0]=i.charCodeAt(s);t()[a>>>0]=0,r+=i.length+1}),0}function ir(e,t){if(h)return N(19,1,e,t);e>>>=0,t>>>=0;var n=nr();o()[e>>>2>>>0]=n.length;var r=0;return n.forEach(e=>r+=e.length+1),o()[t>>>2>>>0]=r,0}function ar(e){return h?N(20,1,e):52}function or(e,t,n,r){return h?N(21,1,e,t,n,r):52}function sr(e,t,n,r){return h?N(22,1,e,t,n,r):70}var cr=[null,[],[]];function lr(e,t,r,i){if(h)return N(23,1,e,t,r,i);t>>>=0,r>>>=0,i>>>=0;for(var a=0,s=0;s<r;s++){var c=o()[t>>>2>>>0],l=o()[t+4>>>2>>>0];t+=8;for(var u=0;u<l;u++){var d=n()[c+u>>>0],f=cr[e];d===0||d===10?((e===1?D:O)(et(f,0)),f.length=0):f.push(d)}a+=l}return o()[i>>>2>>>0]=a,0}var ur=[31,29,31,30,31,30,31,31,30,31,30,31],dr=[31,28,31,30,31,30,31,31,30,31,30,31],fr=(e,n)=>{t().set(e,n>>>0)};function pr(e,t,n,r){function i(e,t,n){for(e=typeof e==`number`?e.toString():e||``;e.length<t;)e=n[0]+e;return e}function s(e,t){return i(e,t,`0`)}function c(e,t){function n(e){return 0>e?-1:+(0<e)}var r;return(r=n(e.getFullYear()-t.getFullYear()))===0&&(r=n(e.getMonth()-t.getMonth()))===0&&(r=n(e.getDate()-t.getDate())),r}function l(e){switch(e.getDay()){case 0:return new Date(e.getFullYear()-1,11,29);case 1:return e;case 2:return new Date(e.getFullYear(),0,3);case 3:return new Date(e.getFullYear(),0,2);case 4:return new Date(e.getFullYear(),0,1);case 5:return new Date(e.getFullYear()-1,11,31);case 6:return new Date(e.getFullYear()-1,11,30)}}function u(e){var t=e.Bb;for(e=new Date(new Date(e.Cb+1900,0,1).getTime());0<t;){var n=e.getMonth(),r=(On(e.getFullYear())?ur:dr)[n];if(!(t>r-e.getDate())){e.setDate(e.getDate()+t);break}t-=r-e.getDate()+1,e.setDate(1),11>n?e.setMonth(n+1):(e.setMonth(0),e.setFullYear(e.getFullYear()+1))}return n=new Date(e.getFullYear()+1,0,4),t=l(new Date(e.getFullYear(),0,4)),n=l(n),0>=c(t,e)?0>=c(n,e)?e.getFullYear()+1:e.getFullYear():e.getFullYear()-1}e>>>=0,t>>>=0,n>>>=0,r>>>=0;var d=o()[r+40>>>2>>>0];for(var f in r={kc:a()[r>>>2>>>0],jc:a()[r+4>>>2>>>0],Hb:a()[r+8>>>2>>>0],Lb:a()[r+12>>>2>>>0],Ib:a()[r+16>>>2>>>0],Cb:a()[r+20>>>2>>>0],ub:a()[r+24>>>2>>>0],Bb:a()[r+28>>>2>>>0],rc:a()[r+32>>>2>>>0],ic:a()[r+36>>>2>>>0],lc:d?P(d):``},n=P(n),d={"%c":`%a %b %d %H:%M:%S %Y`,"%D":`%m/%d/%y`,"%F":`%Y-%m-%d`,"%h":`%b`,"%r":`%I:%M:%S %p`,"%R":`%H:%M`,"%T":`%H:%M:%S`,"%x":`%m/%d/%y`,"%X":`%H:%M:%S`,"%Ec":`%c`,"%EC":`%C`,"%Ex":`%m/%d/%y`,"%EX":`%H:%M:%S`,"%Ey":`%y`,"%EY":`%Y`,"%Od":`%d`,"%Oe":`%e`,"%OH":`%H`,"%OI":`%I`,"%Om":`%m`,"%OM":`%M`,"%OS":`%S`,"%Ou":`%u`,"%OU":`%U`,"%OV":`%V`,"%Ow":`%w`,"%OW":`%W`,"%Oy":`%y`})n=n.replace(new RegExp(f,`g`),d[f]);var p=`Sunday Monday Tuesday Wednesday Thursday Friday Saturday`.split(` `),m=`January February March April May June July August September October November December`.split(` `);for(f in d={"%a":e=>p[e.ub].substring(0,3),"%A":e=>p[e.ub],"%b":e=>m[e.Ib].substring(0,3),"%B":e=>m[e.Ib],"%C":e=>s((e.Cb+1900)/100|0,2),"%d":e=>s(e.Lb,2),"%e":e=>i(e.Lb,2,` `),"%g":e=>u(e).toString().substring(2),"%G":u,"%H":e=>s(e.Hb,2),"%I":e=>((e=e.Hb)==0?e=12:12<e&&(e-=12),s(e,2)),"%j":e=>{for(var t=0,n=0;n<=e.Ib-1;t+=(On(e.Cb+1900)?ur:dr)[n++]);return s(e.Lb+t,3)},"%m":e=>s(e.Ib+1,2),"%M":e=>s(e.jc,2),"%n":()=>`
`,"%p":e=>0<=e.Hb&&12>e.Hb?`AM`:`PM`,"%S":e=>s(e.kc,2),"%t":()=>`	`,"%u":e=>e.ub||7,"%U":e=>s(Math.floor((e.Bb+7-e.ub)/7),2),"%V":e=>{var t=Math.floor((e.Bb+7-(e.ub+6)%7)/7);if(2>=(e.ub+371-e.Bb-2)%7&&t++,t)t==53&&((n=(e.ub+371-e.Bb)%7)==4||n==3&&On(e.Cb)||(t=1));else{t=52;var n=(e.ub+7-e.Bb-1)%7;(n==4||n==5&&On(e.Cb%400-1))&&t++}return s(t,2)},"%w":e=>e.ub,"%W":e=>s(Math.floor((e.Bb+7-(e.ub+6)%7)/7),2),"%y":e=>(e.Cb+1900).toString().substring(2),"%Y":e=>e.Cb+1900,"%z":e=>{var t=0<=(e=e.ic);return e=Math.abs(e)/60,(t?`+`:`-`)+(`0000`+(e/60*100+e%60)).slice(-4)},"%Z":e=>e.lc,"%%":()=>`%`},n=n.replace(/%%/g,`\0\0`),d)n.includes(f)&&(n=n.replace(new RegExp(f,`g`),d[f](r)));return f=function(e){var t=Array(rt(e)+1);return it(e,t,0,t.length),t}(n=n.replace(/\0\0/g,`%`)),f.length>t?0:(fr(f,e),f.length-1)}function mr(e,t,n,r){return pr(e>>>0,t>>>0,n>>>0,r>>>0)}h||function(){for(var e=d.numThreads-1;e--;)Ge();me.unshift(()=>{ge++,function(e){h?e():Promise.all(Le.map(We)).then(e)}(()=>ye())})}();for(var hr=Array(256),gr=0;256>gr;++gr)hr[gr]=String.fromCharCode(gr);mt=hr,ht=d.BindingError=class extends Error{constructor(e){super(e),this.name=`BindingError`}},d.InternalError=class extends Error{constructor(e){super(e),this.name=`InternalError`}},Et.push(0,1,void 0,1,null,1,!0,1,!1,1),d.count_emval_handles=()=>Et.length/2-5-R.length;var _r=[Pe,Fe,Ze,tt,nt,ot,F,st,I,ct,L,lt,ut,dt,ft,pt,Nn,Pn,rr,ir,ar,or,sr,lr],Q=function(){function e(e,t){return Q=e.exports,Q=function(){var e=Q,t={};for(let[n,r]of Object.entries(e))t[n]=typeof r==`function`?(...e)=>{K.push(n);try{return r(...e)}finally{pe||(K.pop(),W&&nn===1&&K.length===0&&(nn=0,Ne+=1,tn(Ir),typeof Fibers<`u`&&Fibers.sc()))}}:r;return t}(),Q=function(){var e=Q,t=e=>t=>e(t)>>>0,n=e=>()=>e()>>>0;return(e=Object.assign({},e)).Ca=t(e.Ca),e.fb=n(e.fb),e.gb=t(e.gb),e.emscripten_main_runtime_thread_id=n(e.emscripten_main_runtime_thread_id),e.sb=t(e.sb),e.tb=n(e.tb),e}(),ze.push(Q.ib),M.unshift(Q.Ba),te=t,ye(),Q}var t=Ee();if(ge++,d.instantiateWasm)try{return d.instantiateWasm(t,e)}catch(e){O(`Module.instantiateWasm callback failed with error: ${e}`),u(e)}return xe||=d.locateFile?Se(`ort-wasm-simd-threaded.jsep.wasm`)?`ort-wasm-simd-threaded.jsep.wasm`:d.locateFile?d.locateFile(`ort-wasm-simd-threaded.jsep.wasm`,C):C+`ort-wasm-simd-threaded.jsep.wasm`:new URL(`/video/studio/assets/ort-wasm-simd-threaded.jsep-Bj7LIWiD.wasm`,``+import.meta.url).href,function(e,t){var n=xe;return w||typeof WebAssembly.instantiateStreaming!=`function`||Se(n)||Ce(n)||typeof fetch!=`function`?Te(n,e,t):fetch(n,{credentials:`same-origin`}).then(r=>WebAssembly.instantiateStreaming(r,e).then(t,function(r){return O(`wasm streaming compile failed: ${r}`),O(`falling back to ArrayBuffer instantiation`),Te(n,e,t)}))}(t,function(t){e(t.instance,t.module)}).catch(u),{}}(),vr=e=>(vr=Q.Ca)(e),yr=()=>(yr=Q.Da)();d._OrtInit=(e,t)=>(d._OrtInit=Q.Ea)(e,t),d._OrtGetLastError=(e,t)=>(d._OrtGetLastError=Q.Fa)(e,t),d._OrtCreateSessionOptions=(e,t,n,r,i,a,o,s,c,l)=>(d._OrtCreateSessionOptions=Q.Ga)(e,t,n,r,i,a,o,s,c,l),d._OrtAppendExecutionProvider=(e,t)=>(d._OrtAppendExecutionProvider=Q.Ha)(e,t),d._OrtAddFreeDimensionOverride=(e,t,n)=>(d._OrtAddFreeDimensionOverride=Q.Ia)(e,t,n),d._OrtAddSessionConfigEntry=(e,t,n)=>(d._OrtAddSessionConfigEntry=Q.Ja)(e,t,n),d._OrtReleaseSessionOptions=e=>(d._OrtReleaseSessionOptions=Q.Ka)(e),d._OrtCreateSession=(e,t,n)=>(d._OrtCreateSession=Q.La)(e,t,n),d._OrtReleaseSession=e=>(d._OrtReleaseSession=Q.Ma)(e),d._OrtGetInputOutputCount=(e,t,n)=>(d._OrtGetInputOutputCount=Q.Na)(e,t,n),d._OrtGetInputName=(e,t)=>(d._OrtGetInputName=Q.Oa)(e,t),d._OrtGetOutputName=(e,t)=>(d._OrtGetOutputName=Q.Pa)(e,t),d._OrtFree=e=>(d._OrtFree=Q.Qa)(e),d._OrtCreateTensor=(e,t,n,r,i,a)=>(d._OrtCreateTensor=Q.Ra)(e,t,n,r,i,a),d._OrtGetTensorData=(e,t,n,r,i)=>(d._OrtGetTensorData=Q.Sa)(e,t,n,r,i),d._OrtReleaseTensor=e=>(d._OrtReleaseTensor=Q.Ta)(e),d._OrtCreateRunOptions=(e,t,n,r)=>(d._OrtCreateRunOptions=Q.Ua)(e,t,n,r),d._OrtAddRunConfigEntry=(e,t,n)=>(d._OrtAddRunConfigEntry=Q.Va)(e,t,n),d._OrtReleaseRunOptions=e=>(d._OrtReleaseRunOptions=Q.Wa)(e),d._OrtCreateBinding=e=>(d._OrtCreateBinding=Q.Xa)(e),d._OrtBindInput=(e,t,n)=>(d._OrtBindInput=Q.Ya)(e,t,n),d._OrtBindOutput=(e,t,n,r)=>(d._OrtBindOutput=Q.Za)(e,t,n,r),d._OrtClearBoundOutputs=e=>(d._OrtClearBoundOutputs=Q._a)(e),d._OrtReleaseBinding=e=>(d._OrtReleaseBinding=Q.$a)(e),d._OrtRunWithBinding=(e,t,n,r,i)=>(d._OrtRunWithBinding=Q.ab)(e,t,n,r,i),d._OrtRun=(e,t,n,r,i,a,o,s)=>(d._OrtRun=Q.bb)(e,t,n,r,i,a,o,s),d._OrtEndProfiling=e=>(d._OrtEndProfiling=Q.cb)(e),d._JsepOutput=(e,t,n)=>(d._JsepOutput=Q.db)(e,t,n),d._JsepGetNodeName=e=>(d._JsepGetNodeName=Q.eb)(e);var br,xr=()=>(xr=Q.fb)(),Sr=d._malloc=e=>(Sr=d._malloc=Q.gb)(e),Cr=d._free=e=>(Cr=d._free=Q.hb)(e),wr=(e,t,n,r,i,a)=>(wr=Q.kb)(e,t,n,r,i,a),Tr=()=>(Tr=Q.lb)(),Er=(e,t,n,r,i)=>(Er=Q.mb)(e,t,n,r,i),Dr=e=>(Dr=Q.nb)(e),Or=e=>(Or=Q.ob)(e),kr=()=>(kr=Q.pb)(),Ar=(e,t)=>(Ar=Q.qb)(e,t),jr=e=>(jr=Q.rb)(e),Mr=e=>(Mr=Q.sb)(e),Nr=()=>(Nr=Q.tb)(),Pr=d.dynCall_ii=(e,t)=>(Pr=d.dynCall_ii=Q.vb)(e,t),Fr=e=>(Fr=Q.wb)(e),Ir=()=>(Ir=Q.xb)(),Lr=e=>(Lr=Q.yb)(e),$=()=>($=Q.zb)();function Rr(){0<ge||(h?(l(d),h||Ke(M),startWorker(d)):(Ke(me),0<ge||br||(br=!0,d.calledRun=!0,pe||(h||Ke(M),l(d),h||Ke(he)))))}return d.___start_em_js=882450,d.___stop_em_js=882672,d.stackSave=()=>Nr(),d.stackRestore=e=>jr(e),d.stackAlloc=e=>Mr(e),d.UTF8ToString=P,d.stringToUTF8=at,d.lengthBytesUTF8=rt,ve=function e(){br||Rr(),br||(ve=e)},Rr(),f}),We=Ue,globalThis.self?.name===`em-pthread`&&Ue()}),Ke,qe,Je,Ye,Xe,Ze,Qe,$e,et=l(()=>{Fe(),Ke=import.meta.url??(typeof document<`u`?document.currentScript?.src:typeof self<`u`?self.location?.href:void 0),qe=typeof location>`u`?void 0:location.origin,Je=(e,t)=>{try{let n=t??Ke;return(n?new URL(e,n):new URL(e)).origin===qe}catch{return!1}},Ye=async e=>{let t=await(await fetch(e,{credentials:`same-origin`})).blob();return URL.createObjectURL(t)},Xe=(Be(),f(Ie)).default,Ze=async()=>{if(!Ke)throw Error(`Failed to load proxy worker: cannot determine the script source URL.`);if(Je(Ke))return[void 0,Xe()];let e=await Ye(Ke);return[e,Xe(e)]},Qe=(Ge(),f(Ve)).default,$e=async(e,t,n)=>[void 0,Qe]}),P,tt,nt,rt,it,at,ot,F,st=l(()=>{et(),tt=!1,nt=!1,rt=!1,it=()=>{if(typeof SharedArrayBuffer>`u`)return!1;try{return typeof MessageChannel<`u`&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},at=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},ot=async e=>{if(tt)return Promise.resolve();if(nt)throw Error(`multiple calls to 'initializeWebAssembly()' detected.`);if(rt)throw Error(`previous call to 'initializeWebAssembly()' failed.`);nt=!0;let t=e.initTimeout,n=e.numThreads;if(!at())throw Error(`WebAssembly SIMD is not supported in the current environment.`);let r=it();n>1&&!r&&(typeof self<`u`&&!self.crossOriginIsolated&&console.warn(`env.wasm.numThreads is set to `+n+`, but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info.`),console.warn(`WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading.`),e.numThreads=n=1);let i=e.wasmPaths,a=typeof i==`string`?i:void 0,o=i?.mjs,s=o?.href??o,c=i?.wasm,l=c?.href??c,u=e.wasmBinary,[d,f]=await $e(s,a,n>1),p=!1,m=[];if(t>0&&m.push(new Promise(e=>{setTimeout(()=>{p=!0,e()},t)})),m.push(new Promise((e,t)=>{let r={numThreads:n};u?r.wasmBinary=u:(l||a)&&(r.locateFile=(e,t)=>l??(a??t)+e),f(r).then(t=>{nt=!1,tt=!0,P=t,e(),d&&URL.revokeObjectURL(d)},e=>{nt=!1,rt=!0,t(e)})})),await Promise.race(m),p)throw Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`)},F=()=>{if(tt&&P)return P;throw Error(`WebAssembly is not initialized yet.`)}}),I,ct,L,lt=l(()=>{st(),I=(e,t)=>{let n=F(),r=n.lengthBytesUTF8(e)+1,i=n._malloc(r);return n.stringToUTF8(e,i,r),t.push(i),i},ct=(e,t,n,r)=>{if(typeof e==`object`&&e){if(n.has(e))throw Error(`Circular reference in options`);n.add(e)}Object.entries(e).forEach(([e,i])=>{let a=t?t+e:e;if(typeof i==`object`)ct(i,a+`.`,n,r);else if(typeof i==`string`||typeof i==`number`)r(a,i.toString());else if(typeof i==`boolean`)r(a,i?`1`:`0`);else throw Error(`Can't handle extra config type: ${typeof i}`)})},L=e=>{let t=F(),n=t.stackSave();try{let n=t.stackAlloc(8);t._OrtGetLastError(n,n+4);let r=t.HEAP32[n/4],i=t.HEAPU32[n/4+1],a=i?t.UTF8ToString(i):``;throw Error(`${e} ERROR_CODE: ${r}, ERROR_MESSAGE: ${a}`)}finally{t.stackRestore(n)}}}),ut,dt=l(()=>{st(),lt(),ut=e=>{let t=F(),n=0,r=[],i=e||{};try{if(e?.logSeverityLevel===void 0)i.logSeverityLevel=2;else if(typeof e.logSeverityLevel!=`number`||!Number.isInteger(e.logSeverityLevel)||e.logSeverityLevel<0||e.logSeverityLevel>4)throw Error(`log serverity level is not valid: ${e.logSeverityLevel}`);if(e?.logVerbosityLevel===void 0)i.logVerbosityLevel=0;else if(typeof e.logVerbosityLevel!=`number`||!Number.isInteger(e.logVerbosityLevel))throw Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);e?.terminate===void 0&&(i.terminate=!1);let a=0;return e?.tag!==void 0&&(a=I(e.tag,r)),n=t._OrtCreateRunOptions(i.logSeverityLevel,i.logVerbosityLevel,!!i.terminate,a),n===0&&L(`Can't create run options.`),e?.extra!==void 0&&ct(e.extra,``,new WeakSet,(e,i)=>{let a=I(e,r),o=I(i,r);t._OrtAddRunConfigEntry(n,a,o)!==0&&L(`Can't set a run config entry: ${e} - ${i}.`)}),[n,r]}catch(e){throw n!==0&&t._OrtReleaseRunOptions(n),r.forEach(e=>t._free(e)),e}}}),ft,pt,mt,ht,gt,_t=l(()=>{st(),lt(),ft=e=>{switch(e){case`disabled`:return 0;case`basic`:return 1;case`extended`:return 2;case`all`:return 99;default:throw Error(`unsupported graph optimization level: ${e}`)}},pt=e=>{switch(e){case`sequential`:return 0;case`parallel`:return 1;default:throw Error(`unsupported execution mode: ${e}`)}},mt=e=>{e.extra||={},e.extra.session||(e.extra.session={});let t=e.extra.session;t.use_ort_model_bytes_directly||=`1`,e.executionProviders&&e.executionProviders.some(e=>(typeof e==`string`?e:e.name)===`webgpu`)&&(e.enableMemPattern=!1)},ht=(e,t,n)=>{for(let r of t){let t=typeof r==`string`?r:r.name;switch(t){case`webnn`:if(t=`WEBNN`,typeof r!=`string`){let t=r?.deviceType;if(t){let r=I(`deviceType`,n),i=I(t,n);F()._OrtAddSessionConfigEntry(e,r,i)!==0&&L(`Can't set a session config entry: 'deviceType' - ${t}.`)}}break;case`webgpu`:if(t=`JS`,typeof r!=`string`){let t=r;if(t?.preferredLayout){if(t.preferredLayout!==`NCHW`&&t.preferredLayout!==`NHWC`)throw Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${t.preferredLayout}`);let r=I(`preferredLayout`,n),i=I(t.preferredLayout,n);F()._OrtAddSessionConfigEntry(e,r,i)!==0&&L(`Can't set a session config entry: 'preferredLayout' - ${t.preferredLayout}.`)}}break;case`wasm`:case`cpu`:continue;default:throw Error(`not supported execution provider: ${t}`)}let i=I(t,n);F()._OrtAppendExecutionProvider(e,i)!==0&&L(`Can't append execution provider: ${t}.`)}},gt=e=>{let t=F(),n=0,r=[],i=e||{};mt(i);try{let e=ft(i.graphOptimizationLevel??`all`),a=pt(i.executionMode??`sequential`),o=typeof i.logId==`string`?I(i.logId,r):0,s=i.logSeverityLevel??2;if(!Number.isInteger(s)||s<0||s>4)throw Error(`log serverity level is not valid: ${s}`);let c=i.logVerbosityLevel??0;if(!Number.isInteger(c)||c<0||c>4)throw Error(`log verbosity level is not valid: ${c}`);let l=typeof i.optimizedModelFilePath==`string`?I(i.optimizedModelFilePath,r):0;if(n=t._OrtCreateSessionOptions(e,!!i.enableCpuMemArena,!!i.enableMemPattern,a,!!i.enableProfiling,0,o,s,c,l),n===0&&L(`Can't create session options.`),i.executionProviders&&ht(n,i.executionProviders,r),i.enableGraphCapture!==void 0){if(typeof i.enableGraphCapture!=`boolean`)throw Error(`enableGraphCapture must be a boolean value: ${i.enableGraphCapture}`);let e=I(`enableGraphCapture`,r),a=I(i.enableGraphCapture.toString(),r);t._OrtAddSessionConfigEntry(n,e,a)!==0&&L(`Can't set a session config entry: 'enableGraphCapture' - ${i.enableGraphCapture}.`)}if(i.freeDimensionOverrides)for(let[e,a]of Object.entries(i.freeDimensionOverrides)){if(typeof e!=`string`)throw Error(`free dimension override name must be a string: ${e}`);if(typeof a!=`number`||!Number.isInteger(a)||a<0)throw Error(`free dimension override value must be a non-negative integer: ${a}`);let i=I(e,r);t._OrtAddFreeDimensionOverride(n,i,a)!==0&&L(`Can't set a free dimension override: ${e} - ${a}.`)}return i.extra!==void 0&&ct(i.extra,``,new WeakSet,(e,i)=>{let a=I(e,r),o=I(i,r);t._OrtAddSessionConfigEntry(n,a,o)!==0&&L(`Can't set a session config entry: ${e} - ${i}.`)}),[n,r]}catch(e){throw n!==0&&t._OrtReleaseSessionOptions(n),r.forEach(e=>t._free(e)),e}}}),vt,yt,bt,xt,St,Ct,wt,Tt,R=l(()=>{vt=e=>{switch(e){case`int8`:return 3;case`uint8`:return 2;case`bool`:return 9;case`int16`:return 5;case`uint16`:return 4;case`int32`:return 6;case`uint32`:return 12;case`float16`:return 10;case`float32`:return 1;case`float64`:return 11;case`string`:return 8;case`int64`:return 7;case`uint64`:return 13;case`int4`:return 22;case`uint4`:return 21;default:throw Error(`unsupported data type: ${e}`)}},yt=e=>{switch(e){case 3:return`int8`;case 2:return`uint8`;case 9:return`bool`;case 5:return`int16`;case 4:return`uint16`;case 6:return`int32`;case 12:return`uint32`;case 10:return`float16`;case 1:return`float32`;case 11:return`float64`;case 8:return`string`;case 7:return`int64`;case 13:return`uint64`;case 22:return`int4`;case 21:return`uint4`;default:throw Error(`unsupported data type: ${e}`)}},bt=(e,t)=>{let n=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][e],r=typeof t==`number`?t:t.reduce((e,t)=>e*t,1);return n>0?Math.ceil(r*n):void 0},xt=e=>{switch(e){case`float16`:return typeof Float16Array<`u`&&Float16Array.from?Float16Array:Uint16Array;case`float32`:return Float32Array;case`uint8`:return Uint8Array;case`int8`:return Int8Array;case`uint16`:return Uint16Array;case`int16`:return Int16Array;case`int32`:return Int32Array;case`bool`:return Uint8Array;case`float64`:return Float64Array;case`uint32`:return Uint32Array;case`int64`:return BigInt64Array;case`uint64`:return BigUint64Array;default:throw Error(`unsupported type: ${e}`)}},St=e=>{switch(e){case`verbose`:return 0;case`info`:return 1;case`warning`:return 2;case`error`:return 3;case`fatal`:return 4;default:throw Error(`unsupported logging level: ${e}`)}},Ct=e=>e===`float32`||e===`float16`||e===`int32`||e===`int64`||e===`uint32`||e===`uint8`||e===`bool`||e===`uint4`||e===`int4`,wt=e=>e===`float32`||e===`float16`||e===`int32`||e===`int64`||e===`uint32`||e===`uint64`||e===`int8`||e===`uint8`||e===`bool`,Tt=e=>{switch(e){case`none`:return 0;case`cpu`:return 1;case`cpu-pinned`:return 2;case`texture`:return 3;case`gpu-buffer`:return 4;case`ml-tensor`:return 5;default:throw Error(`unsupported data location: ${e}`)}}}),Et,Dt=l(()=>{Fe(),Et=async e=>{if(typeof e==`string`){let t=await fetch(e);if(!t.ok)throw Error(`failed to load external data file: ${e}`);let n=t.headers.get(`Content-Length`),r=n?parseInt(n,10):0;if(r<1073741824)return new Uint8Array(await t.arrayBuffer());{if(!t.body)throw Error(`failed to load external data file: ${e}, no response body.`);let n=t.body.getReader(),i;try{i=new ArrayBuffer(r)}catch(e){if(e instanceof RangeError){let e=Math.ceil(r/65536);i=new WebAssembly.Memory({initial:e,maximum:e}).buffer}else throw e}let a=0;for(;;){let{done:e,value:t}=await n.read();if(e)break;let r=t.byteLength;new Uint8Array(i,a,r).set(t),a+=r}return new Uint8Array(i,0,r)}}else return e instanceof Blob?new Uint8Array(await e.arrayBuffer()):e instanceof Uint8Array?e:new Uint8Array(e)}}),Ot,kt,At,jt,Mt,Nt,z,Pt=l(()=>{R(),Ot=[`V`,`I`,`W`,`E`,`F`],kt=(e,t)=>{console.log(`[${Ot[e]},${new Date().toISOString()}]${t}`)},Mt=(e,t)=>{At=e,jt=t},Nt=(e,t)=>{let n=St(e);n>=St(At)&&kt(n,typeof t==`function`?t():t)},z=(...e)=>{jt&&Nt(...e)}}),Ft,It=l(()=>{R(),Ft=(e,t)=>new(xt(t))(e)}),Lt=l(()=>{}),Rt,zt,Bt,Vt,Ht,Ut,Wt,Gt,Kt,qt=l(()=>{Pt(),Lt(),Rt=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),zt=[],Bt=e=>Math.ceil(e/16)*16,Vt=e=>{for(let t=0;t<zt.length;t++){let n=zt[t];if(e<=n)return n}return Math.ceil(e/16)*16},Ht=1,Ut=()=>Ht++,Wt=async(e,t,n,r)=>{let i=Bt(n),a=e.device.createBuffer({size:i,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let o=e.getCommandEncoder();e.endComputePass(),o.copyBufferToBuffer(t,0,a,0,i),e.flush(),await a.mapAsync(GPUMapMode.READ);let s=a.getMappedRange();if(r){let e=r();return e.set(new Uint8Array(s,0,n)),e}else return new Uint8Array(s.slice(0,n))}finally{a.destroy()}},Gt=class{constructor(e){this.backend=e,this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersForUploadingPending=[],this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[e]of Rt)zt.push(e),this.freeBuffers.set(e,[]),this.freeUniformBuffers.set(e,[])}upload(e,t){let n=t.buffer,r=t.byteOffset,i=t.byteLength,a=Bt(i),o=this.storageCache.get(e);if(!o)throw Error(`gpu data for uploading does not exist`);if(o.originalSize!==i)throw Error(`inconsistent data size. gpu data size=${o.originalSize}, data size=${i}`);let s=this.backend.device.createBuffer({mappedAtCreation:!0,size:a,usage:GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC}),c=s.getMappedRange();new Uint8Array(c).set(new Uint8Array(n,r,i)),s.unmap();let l=this.backend.getCommandEncoder();this.backend.endComputePass(),l.copyBufferToBuffer(s,0,o.gpuData.buffer,0,a),z(`verbose`,()=>`[WebGPU] GpuDataManager.upload(id=${e})`),this.buffersForUploadingPending.push(s)}memcpy(e,t){let n=this.storageCache.get(e);if(!n)throw Error(`source gpu data for memcpy does not exist`);let r=this.storageCache.get(t);if(!r)throw Error(`destination gpu data for memcpy does not exist`);if(n.originalSize!==r.originalSize)throw Error(`inconsistent source and destination gpu data size`);let i=Bt(n.originalSize),a=this.backend.getCommandEncoder();this.backend.endComputePass(),a.copyBufferToBuffer(n.gpuData.buffer,0,r.gpuData.buffer,0,i)}registerExternalBuffer(e,t,n){let r;if(n){if(r=n[0],e===n[1])return z(`verbose`,()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${r}, buffer is the same, skip.`),r;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else r=Ut();return this.storageCache.set(r,{gpuData:{id:r,type:0,buffer:e},originalSize:t}),z(`verbose`,()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${r}, registered.`),r}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),z(`verbose`,()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let n=Vt(e),r,i=(t&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,a=(t&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(i||a){let e=(i?this.freeBuffers:this.freeUniformBuffers).get(n);r=e&&e.length>0?e.pop():this.backend.device.createBuffer({size:n,usage:t})}else r=this.backend.device.createBuffer({size:n,usage:t});let o={id:Ut(),type:0,buffer:r};return this.storageCache.set(o.id,{gpuData:o,originalSize:e}),z(`verbose`,()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${o.id}`),o}get(e){return this.storageCache.get(e)?.gpuData}release(e){let t=this.storageCache.get(e);if(!t)throw Error(`releasing data does not exist`);return z(`verbose`,()=>`[WebGPU] GpuDataManager.release(id=${e}), gpuDataId=${t.gpuData.id}`),this.storageCache.delete(e),this.buffersPending.push(t.gpuData.buffer),t.originalSize}async download(e,t){let n=this.storageCache.get(e);if(!n)throw Error(`data does not exist`);await Wt(this.backend,n.gpuData.buffer,n.originalSize,t)}refreshPendingBuffers(){for(let e of this.buffersForUploadingPending)e.destroy();if(this.buffersForUploadingPending=[],this.buffersPending.length!==0)if(this.backend.sessionStatus===`default`){for(let e of this.buffersPending){let t=Rt.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let n=this.freeBuffers.get(e.size)||[];t===void 0||n.length>=t?e.destroy():n.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let n=this.freeUniformBuffers.get(e.size)||[];t===void 0||n.length>=t?e.destroy():n.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let t of this.buffersPending)e.push(t);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(e=>{e.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(e=>{e.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(e=>{e.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onReleaseSession(e){let t=this.capturedPendingBuffers.get(e);t&&(t.forEach(e=>{e.destroy()}),this.capturedPendingBuffers.delete(e))}},Kt=(...e)=>new Gt(...e)}),Jt,B,V=l(()=>{Jt=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(`;`),this.key}},B=e=>new Jt(e)}),Yt,Xt,H,Zt,Qt,$t,en,U=l(()=>{Yt=class{static calcMatMulShape(e,t){return e[1]===t[0]?[e[0],t[1]]:void 0}},Xt=class{static calcShape(e,t,n=!1){let r=e.length,i=t.length;if(r===0)return t;if(i===0)return e;let a=Math.max(e.length,t.length),o=Array(a);if(n){if(r<2||i<2)return;let n=Yt.calcMatMulShape([e[r-2],e[r-1]],[t[i-2],t[i-1]]);if(n===void 0)return;[o[a-2],o[a-1]]=n}for(let s=n?3:1;s<=a;s++){let n=r-s<0?1:e[r-s],c=i-s<0?1:t[i-s];if(n!==c&&n>1&&c>1)return;let l=Math.max(n,c);if(n&&c)o[a-s]=Math.max(n,c);else{if(l>1)return;o[a-s]=0}}return o}static isValidBroadcast(e,t){let n=e.length,r=t.length;if(n>r)return!1;for(let i=1;i<=n;i++)if(e[n-i]!==1&&e[n-i]!==t[r-i])return!1;return!0}},H=class e{static size(t){return e.getSizeFromDimensionRange(t,0,t.length)}static convertShape(e,t=4){let n=e.length;if(n===0)return[];let r=Array(n),i=n-1;for(;i>=0;){if(e[i]%t===0){r[i]=e[i]/t;break}if(t%e[i]!==0)throw Error(`cannot convert shape`);r[i]=1,t/=e[i],i--}for(i--;i>=0;i--)r[i]=e[i];return r}static sizeFromDimension(t,n){if(n<0||n>t.length)throw Error(`invalid dimension of ${n} for sizeFromDimension as Tensor has ${t.length} dimensions.`);return e.getSizeFromDimensionRange(t,n,t.length)}static sizeToDimension(t,n){if(n<0||n>t.length)throw Error(`invalid dimension of ${n} for sizeToDimension as Tensor has ${t.length} dimensions.`);return e.getSizeFromDimensionRange(t,0,n)}static getSizeFromDimensionRange(e,t,n){let r=1;for(let i=t;i<n;i++){if(e[i]<0)throw Error(`cannot get valid size from specified dimension range. Most likely the range contains negative values in them.`);r*=e[i]}return r}static computeStrides(e){let t=e.length;if(t===0)return[];if(t===1)return[1];let n=Array(t);n[t-1]=1,n[t-2]=e[t-1];for(let r=t-3;r>=0;--r)n[r]=n[r+1]*e[r+1];return n}static normalizeAxis(e,t){if(e<-t&&e>=t)throw Error(`unsupported axis for this operation.`);return e<0?e+t:e}static normalizeAxes(e,t){return e.map(n=>this.normalizeAxis(n,t??e.length))}static sortBasedOnPerm(e,t){return t?t.map(t=>e[t]):e.slice().reverse()}static padShape(e,t){let n=e.length;return e.map((e,r)=>e+t[r]+t[r+n])}static areEqual(e,t){return e.length===t.length?e.every((e,n)=>e===t[n]):!1}},Zt=class e{static adjustPoolAttributes(e,t,n,r,i,a){if(!e&&n.length!==t.length-2)throw Error(`length of specified kernel shapes should be 2 less than length of input dimensions`);if(e)for(let e=0;e<t.length-2;e++)e>=n.length?n.push(t[e+2]):n[e]=t[e+2];for(let e=0;e<n.length;e++)if(e<r.length){if(r[e]<0)throw Error(`strides should be greater than or equal to 1`)}else r.push(1);for(let e=0;e<n.length;e++)if(e<i.length){if(i[e]<0)throw Error(`dilations should be greater than or equal to 1`)}else i.push(1);for(let e=0;e<n.length*2;e++)if(e<a.length){if(a[e]<0)throw Error(`pad should be greater than or equal to 1`)}else a.push(0);for(let e=0;e<n.length;e++){if(n[e]<=0)throw Error(`kernel shapes need to be greater than 0`);if(a[e]>=n[e]||a[e+n.length]>=n[e])throw Error(`pads should be smaller than kernel`)}}static adjustPadsBasedOnAutoPad(t,n,r,i,a,o,s){if(s){if(a.length!==2*(t.length-2))throw Error(`length of pads should be twice the length of data dimensions`);if(n.length!==t.length-2)throw Error(`length of strides should be the length of data dimensions`);if(i.length!==t.length-2)throw Error(`length of kernel shapes should be the length of data dimensions`);for(let c=0;c<t.length-2;c++)e.adjustPadAndReturnShape(t[c+(o?1:2)],n[c],r[c],i[c],a,c,c+t.length-2,s)}}static computePoolOutputShape(t,n,r,i,a,o,s){if(n.length<=0)throw Error(`input shape must be of size greater than 0`);let c=[n[0],n[1]];return e.computeShapeHelper(t,n,c,r,i,a,o,s),c}static computeConvOutputShape(t,n,r,i,a,o,s){if(t.length<=0||n.length<=0)throw Error(`invalid input tensor dims or invalid filter tensor dims`);let c=[t[0],n[0]];return e.computeShapeHelper(!1,t,c,r,i,a,o,s),c}static computeShapeHelper(t,n,r,i,a,o,s,c){if(t)for(let e=0;e<n.length-2;e++)r.push(1);else for(let t=0;t<n.length-2;t++)r.push(e.adjustPadAndReturnShape(n[t+2],i[t],a[t],o[t],s,t,t+n.length-2,c))}static adjustPadAndReturnShape(e,t,n,r,i,a,o,s){let c=n*(r-1)+1;if(s&&s!==`NOTSET`)switch(s){case`VALID`:return i[a]=0,i[o]=0,Math.floor((e-c)/t+1);case`SAME_LOWER`:case`SAME_UPPER`:if(n!==1)throw Error(`Dilation not supported for SAME_UPPER or SAME_LOWER`);{let n=((e+t-1)/t-1)*t+r-e;return i[a]=Math.floor(s===`SAME_LOWER`?(n+1)/2:n/2),i[o]=n-i[a],Math.floor((e+n-r)/t+1)}default:throw Error(`Unsupported AutoPad type`)}else return Math.floor((e+i[a]+i[o]-c)/t+1)}},Qt=class{static getShapeOfGemmResult(e,t,n,r,i){if(e.length!==2||n.length!==2)throw Error(`shape need to be of size 2`);let a,o,s;t?(a=e[1],o=e[0]):(a=e[0],o=e[1]);let c=-1;if(r?(s=n[0],c=1):(s=n[1],c=0),n[c]!==o)throw Error(`dimension mismatch`);if(a<=0||s<=0||o<=0)throw Error(`invalid shape specified`);if(i&&!Xt.isValidBroadcast(i,[a,s]))throw Error(`gemm: invalid bias shape for broadcast`);return[a,s,o]}},$t=-34028234663852886e22,en=34028234663852886e22}),tn,nn,W,G,K,q,rn,an,on,J,sn,Y,X,cn,ln,un,dn,Z=l(()=>{R(),U(),tn=64,nn=(e,t)=>{if(t===3)throw Error(`vec3 has same alignment as vec4, use vec4 instead`);switch(e){case 10:return t>1?`vec${t}<f16>`:`f16`;case 1:return t>1?`vec${t}<f32>`:`f32`;case 6:return t>1?`vec${t}<i32>`:`i32`;case 12:return t>1?`vec${t}<u32>`:`u32`;case 7:if(t>1)throw Error(`currently not supported vecX of uint64 yet`);return[`vec2<u32>`,`i32`];case 13:if(t>1)throw Error(`currently not supported vecX of uint64 yet`);return[`vec2<u32>`,`u32`];case 9:if(t!==4)throw Error(`bool must be vec4`);return[`u32`,`vec4<bool>`];case 22:return`i32`;case 21:return`u32`;default:throw Error(`Unknown data type: ${e}`)}},W=(e,t=1)=>{let n=nn(e,t);return typeof n==`string`?n:n[0]},G=(e,t=1)=>{let n=nn(e,t);return typeof n==`string`?n:n[1]},K=(...e)=>{let t=[];return e.forEach(e=>{e.length!==0&&t.push({type:12,data:e},{type:12,data:H.computeStrides(e)})}),t},q=e=>e%4==0?4:e%2==0?2:1,rn=(e=`f32`,t,n=`0`)=>!t||t===1?`${e}(${n})`:`vec${t}<${e}>(${n})`,an=(e,t,n)=>e===`f32`?n:t===1?`f32(${n})`:`vec${t}<f32>(${n})`,on=(e,t)=>t===4?`(${e}.x + ${e}.y + ${e}.z + ${e}.w)`:t===2?`(${e}.x + ${e}.y)`:t===3?`(${e}.x + ${e}.y + ${e}.z)`:e,J=(e,t,n,r)=>e.startsWith(`uniforms.`)&&n>4?typeof t==`string`?r===`f16`?`${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]`:`${e}[(${t}) / 4][(${t}) % 4]`:r===`f16`?`${e}[${Math.floor(t/8)}][${Math.floor(t%8/4)}][${t%8%4}]`:`${e}[${Math.floor(t/4)}][${t%4}]`:n>1?`${e}[${t}]`:e,sn=(e,t,n,r,i)=>{let a=typeof n==`number`,o=a?n:n.length,s=[...Array(o).keys()],c=o<2?`u32`:o<=4?`vec${o}<u32>`:`array<u32, ${o}>`,l=nn(t,i),u=typeof l==`string`?l:l[1],d={indices:c,value:u,storage:typeof l==`string`?l:l[0],tensor:t},f=e=>typeof e==`string`?e:`${e}u`,p={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},m=a?`uniforms.`:``,h=`${m}${e}_shape`,g=`${m}${e}_strides`,_=``;for(let e=0;e<o-1;e++)_+=`
    let dim${e} = current / ${J(g,e,o)};
    let rest${e} = current % ${J(g,e,o)};
    indices[${e}] = dim${e};
    current = rest${e};
    `;_+=`indices[${o-1}] = current;`;let v=o<2?``:`
  fn o2i_${e}(offset: u32) -> ${d.indices} {
    var indices: ${d.indices};
    var current = offset;
    ${_}
    return indices;
  }`,y=t=>(p.offsetToIndices=!0,o<2?t:`o2i_${e}(${t})`),b=[];if(o>=2)for(let e=o-1;e>=0;e--)b.push(`${J(g,e,o)} * (indices[${e}])`);let x=o<2?``:`
  fn i2o_${e}(indices: ${d.indices}) -> u32 {
    return ${b.join(`+`)};
  }`,S=t=>(p.indicesToOffset=!0,o<2?t:`i2o_${e}(${t})`),C=(...e)=>o===0?`0u`:`${d.indices}(${e.map(f).join(`,`)})`,w=(e,t)=>o<2?`${e}`:`${J(e,t,o)}`,T=(e,t,n)=>o<2?`${e}=${n};`:`${J(e,t,o)}=${n};`,E={},D=(t,n)=>{p.broadcastedIndicesToOffset=!0;let r=`${n.name}broadcastedIndicesTo${e}Offset`;if(r in E)return`${r}(${t})`;let i=[];for(let e=o-1;e>=0;e--){let t=n.indicesGet(`outputIndices`,e+n.rank-o);i.push(`${w(g,e)} * (${t} % ${w(h,e)})`)}return E[r]=`fn ${r}(outputIndices: ${n.type.indices}) -> u32 {
             return ${i.length>0?i.join(`+`):`0u`};
           }`,`${r}(${t})`},O=(t,n)=>(()=>{if(d.storage===d.value)return`${e}[${t}]=${n};`;if(d.storage===`vec2<u32>`&&d.value===`i32`)return`${e}[${t}]=vec2<u32>(u32(${n}), select(0u, 0xFFFFFFFFu, ${n} < 0));`;if(d.storage===`vec2<u32>`&&d.value===`u32`)return`${e}[${t}]=vec2<u32>(u32(${n}), 0u);`;if(d.storage===`u32`&&d.value===`vec4<bool>`)return`${e}[${t}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${n}));`;throw Error(`not supported combination of storage type ${d.storage} and value type ${d.value} yet`)})(),k=t=>(()=>{if(d.storage===d.value)return`${e}[${t}]`;if(d.storage===`vec2<u32>`&&d.value===`i32`)return`i32(${e}[${t}].x)`;if(d.storage===`vec2<u32>`&&d.value===`u32`)return`u32(${e}[${t}].x)`;if(d.storage===`u32`&&d.value===`vec4<bool>`)return`vec4<bool>(bool(${e}[${t}] & 0xFFu), bool(${e}[${t}] & 0xFF00u), bool(${e}[${t}] & 0xFF0000u), bool(${e}[${t}] & 0xFF000000u))`;throw Error(`not supported combination of storage type ${d.storage} and value type ${d.value} yet`)})(),ee=o<2?``:`
  fn get_${e}ByIndices(indices: ${d.indices}) -> ${u} {
    return ${k(`i2o_${e}(indices)`)};
  }`,A=o<2?``:`
  fn get_${e}(${s.map(e=>`d${e}: u32`).join(`, `)}) -> ${u} {
    return get_${e}ByIndices(${C(s.map(e=>`d${e}`).join(`, `))});
  }`,te=(...t)=>{if(t.length!==o)throw Error(`indices length must be ${o}`);let n=t.map(f).join(`,`);return o===0?k(`0u`):o===1?k(n[0]):(p.get=!0,p.getByIndices=!0,p.indicesToOffset=!0,`get_${e}(${n})`)},ne=t=>o<2?k(t):(p.getByIndices=!0,p.indicesToOffset=!0,`get_${e}ByIndices(${t})`),re=o<2?``:`
  fn set_${e}ByIndices(indices: ${d.indices}, value: ${u}) {
    ${O(`i2o_${e}(indices)`,`value`)}
  }`,ie=o<2?``:`
  fn set_${e}(${s.map(e=>`d${e}: u32`).join(`, `)}, value: ${u}) {
    set_${e}ByIndices(${C(s.map(e=>`d${e}`).join(`, `))}, value);
  }`;return{impl:()=>{let e=[],t=!1;return p.offsetToIndices&&(e.push(v),t=!0),p.indicesToOffset&&(e.push(x),t=!0),p.broadcastedIndicesToOffset&&(Object.values(E).forEach(t=>e.push(t)),t=!0),p.set&&(e.push(ie),t=!0),p.setByIndices&&(e.push(re),t=!0),p.get&&(e.push(A),t=!0),p.getByIndices&&(e.push(ee),t=!0),!a&&t&&e.unshift(`const ${h} = ${d.indices}(${n.join(`,`)});`,`const ${g} = ${d.indices}(${H.computeStrides(n).join(`,`)});`),e.join(`
`)},type:d,offsetToIndices:y,indicesToOffset:S,broadcastedIndicesToOffset:D,indices:C,indicesGet:w,indicesSet:T,set:(...t)=>{if(t.length!==o+1)throw Error(`indices length must be ${o}`);let n=t[o];if(typeof n!=`string`)throw Error(`value must be string`);let r=t.slice(0,o).map(f).join(`,`);return o===0?O(`0u`,n):o===1?O(r[0],n):(p.set=!0,p.setByIndices=!0,p.indicesToOffset=!0,`set_${e}(${r}, ${n})`)},setByOffset:O,setByIndices:(t,n)=>o<2?O(t,n):(p.setByIndices=!0,p.indicesToOffset=!0,`set_${e}ByIndices(${t}, ${n});`),get:te,getByOffset:k,getByIndices:ne,usage:r,name:e,strides:g,shape:h,rank:o}},Y=(e,t,n,r=1)=>sn(e,t,n,`input`,r),X=(e,t,n,r=1)=>sn(e,t,n,`output`,r),cn=(e,t,n,r=1)=>sn(e,t,n,`internal`,r),ln=class{constructor(e,t){this.normalizedDispatchGroup=e,this.limits=t,this.internalVariables=[],this.variables=[],this.uniforms=[],this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e==`number`?`${e}u`:e}) { return; }`}mainStart(e=tn){let t=typeof e==`number`?e:e[0],n=typeof e==`number`?1:e[1],r=typeof e==`number`?1:e[2];if(t>this.limits.maxComputeWorkgroupSizeX||n>this.limits.maxComputeWorkgroupSizeY||r>this.limits.maxComputeWorkgroupSizeZ)throw Error(`workgroup size [${t}, ${n}, ${r}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(t*n*r>this.limits.maxComputeInvocationsPerWorkgroup)throw Error(`workgroup size [${t}, ${n}, ${r}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let i=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1;return`@compute @workgroup_size(${t}, ${n}, ${r})
  fn main(${i?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`}) {
    ${i?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${t*n*r}u + local_idx;`}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith(`uniforms.`)&&this.uniforms.push({name:e.shape.replace(`uniforms.`,``),type:`u32`,length:e.rank}),e.strides.startsWith(`uniforms.`)&&this.uniforms.push({name:e.strides.replace(`uniforms.`,``),type:`u32`,length:e.rank}))}declareVariable(e,t){if(e.usage===`internal`)throw Error(`cannot use internal variable with declareVariable(). use registerInternalVariables() instead.`);this.variables.push(e),this.appendVariableUniforms(e);let n=e.usage===`input`?`read`:`read_write`,r=e.type.storage;return`@group(0) @binding(${t}) var<storage, ${n}> ${e.name}: array<${r}>;`}declareVariables(...e){return e.map(e=>this.declareVariable(e,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!==`internal`)throw Error(`cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.`);this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(e=>this.registerInternalVariable(e)),this}registerUniform(e,t,n=1){return this.uniforms.push({name:e,type:t,length:n}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return``;let e=[];for(let{name:t,type:n,length:r}of this.uniforms)if(r&&r>4)n===`f16`?e.push(`@align(16) ${t}:array<mat2x4<${n}>, ${Math.ceil(r/8)}>`):e.push(`${t}:array<vec4<${n}>, ${Math.ceil(r/4)}>`);else{let i=r==null||r===1?n:`vec${r}<${n}>`;e.push(`${t}:${i}`)}return`
      struct Uniforms { ${e.join(`, `)} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=e=>[12,10,1,6][[`u32`,`f16`,`f32`,`i32`].indexOf(e)];return this.uniforms.map(t=>[e(t.type),t.length??1])}},un=(e,t)=>new ln(e,t),dn=(e,t)=>{let n=e.length,r=[];for(let i=0;i<n;i++){let a=n-1-i,o=e[a]||1;(t[t.length-1-i]||1)>1&&o===1&&r.unshift(a)}return r}}),fn,pn,mn,hn,gn,_n,vn,yn,bn=l(()=>{R(),U(),V(),Z(),fn=e=>{if(!e||e.length!==1)throw Error(`Transpose requires 1 input.`)},pn=(e,t)=>t&&t.length!==e?[...Array(e).keys()].reverse():t,mn=(e,t)=>H.sortBasedOnPerm(e,pn(e.length,t)),hn=(e,t,n,r)=>{let i=`fn perm(i: ${r.type.indices}) -> ${n.type.indices} {
    var a: ${n.type.indices};`;for(let r=0;r<t;++r)i+=n.indicesSet(`a`,e[r],`i[${r}]`);return i+=`return a;}`},gn=(e,t)=>{let n=[],r=[];for(let i=0;i<e.length;++i)e[i]!==1&&n.push(e[i]),e[t[i]]!==1&&r.push(t[i]);return{newShape:n,newPerm:r}},_n=(e,t)=>{let n=e.dataType,r=e.dims.length,i=pn(r,t),a=mn(e.dims,i),{newShape:o,newPerm:s}=gn(e.dims,i),c=H.areEqual(s,[2,3,1]),l=H.areEqual(s,[3,1,2]),u=o.length===2&&s[0]>s[1]||c||l,d=u?o:e.dims,f=a;u&&(d=c?[o[0],o[1]*o[2]]:l?[o[0]*o[1],o[2]]:o,f=[d[1],d[0]]);let p=Y(`a`,n,d.length),m=X(`output`,n,f.length),h;return h=u?e=>`
  ${e.registerUniform(`output_size`,`u32`).declareVariables(p,m)}
  var<workgroup> tile : array<array<${m.type.value}, 17>, 16>;
  ${e.mainStart([16,16,1])}
    let stride = (uniforms.output_shape[1] - 1) / 16 + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * 16u + local_id.x;
    let input_row = workgroup_id_x * 16u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${p.getByIndices(`${p.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * 16u + local_id.x;
    let output_row = workgroup_id_y * 16u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${m.setByIndices(`${m.type.indices}(output_row, output_col)`,`tile[local_id.x][local_id.y]`)}
    }
  }`:e=>`
  ${e.registerUniform(`output_size`,`u32`).declareVariables(p,m)}

  ${hn(i,r,p,m)}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}

    let indices = ${m.offsetToIndices(`global_idx`)};
    let aIndices = perm(indices);

    ${m.setByOffset(`global_idx`,p.getByIndices(`aIndices`))}
  }`,{name:u?`TransposeShared`:`Transpose`,shaderCache:{hint:`${t}`,inputDependencies:[`rank`]},getRunData:()=>{let t=H.size(a);return{outputs:[{dims:a,dataType:e.dataType}],dispatchGroup:u?{x:Math.ceil(f[1]/16),y:Math.ceil(f[0]/16)}:{x:Math.ceil(t/64)},programUniforms:[{type:12,data:t},...K(d,f)]}},getShaderSource:h}},vn=(e,t)=>{fn(e.inputs),e.compute(_n(e.inputs[0],t.perm))},yn=e=>B({perm:e.perm})}),xn,Sn,Cn,wn,Tn,En,Dn,On,kn,An,jn,Mn,Nn,Pn,Fn,In,Ln,Rn,zn,Bn,Vn,Hn=l(()=>{R(),U(),Z(),hr(),bn(),xn={max:`select(bestValue, candidate, candidate > bestValue)`,min:`select(bestValue, candidate, candidate < bestValue)`,mean:`bestValue + candidate`,sum:`bestValue + candidate`,prod:`bestValue * candidate`,sumSquare:`bestValue + candidate * candidate`,logSumExp:`bestValue + exp(candidate)`,l1:`bestValue + abs(candidate)`,l2:`bestValue + candidate * candidate`,logSum:`bestValue + candidate`},Sn={max:`select(bestValue, candidate, candidate > bestValue)`,min:`select(bestValue, candidate, candidate < bestValue)`,mean:`bestValue + candidate`,sum:`bestValue + candidate`,prod:`bestValue * candidate`,sumSquare:`bestValue + candidate`,logSumExp:`bestValue + candidate`,l1:`bestValue + candidate`,l2:`bestValue + candidate`,logSum:`bestValue + candidate`},Cn={max:`_A[offset]`,min:`_A[offset]`,mean:`0`,sum:`0`,prod:`1`,sumSquare:`0`,logSumExp:`0`,l1:`0`,l2:`0`,logSum:`0`},wn={max:`bestValue`,min:`bestValue`,sum:`bestValue`,prod:`bestValue`,sumSquare:`bestValue`,logSumExp:`log(bestValue)`,l1:`bestValue`,l2:`sqrt(bestValue)`,logSum:`log(bestValue)`},Tn=(e,t)=>{let n=[];for(let r=t-e;r<t;++r)n.push(r);return n},En=(e,t)=>{let n=[],r=e.length;for(let i=0;i<r;i++)t.indexOf(i)===-1&&n.push(e[i]);return[n,t.map(t=>e[t])]},Dn=(e,t)=>{let n=e.length+t.length,r=[],i=0;for(let a=0;a<n;a++)t.indexOf(a)===-1?r.push(e[i++]):r.push(1);return r},On=(e,t)=>{for(let n=0;n<e.length;++n)if(e[e.length-n-1]!==t-1-n)return!1;return!0},kn=(e,t)=>{let n=[];if(!On(e,t)){for(let r=0;r<t;++r)e.indexOf(r)===-1&&n.push(r);e.forEach(e=>n.push(e))}return n},An=(e,t,n,r,i,a,o)=>{let s=n[0].dims,c=H.size(a),l=H.size(o),u=Y(`_A`,n[0].dataType,s),d=X(`output`,i,a);return{name:e,shaderCache:t,getShaderSource:e=>`
        ${e.registerUniform(`reduceSize`,`u32`).declareVariables(u,d)}
        
          var<workgroup> aBestValues : array<f32, 32>;
       
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${e.mainStart(32)}

          let outputIndex = global_idx / 32;
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${Cn[r]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + 32) {
           let candidate = f32(${u.getByOffset(`offset + k`)});
           bestValue = ${xn[r]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, 32u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${Sn[r]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${d.setByOffset(`outputIndex`,`${r===`mean`?`${d.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${d.type.storage}(${wn[r]})`}`)};
         }
        }`,getRunData:()=>({outputs:[{dims:a,dataType:i}],dispatchGroup:{x:c},programUniforms:[{type:12,data:l}]})}},jn=(e,t,n,r)=>{let i=e.inputs.length===1?n:Kn(e.inputs,n),a=i.axes;a.length===0&&!i.noopWithEmptyAxes&&(a=e.inputs[0].dims.map((e,t)=>t));let o=H.normalizeAxes(a,e.inputs[0].dims.length),s=o,c=e.inputs[0],l=kn(s,e.inputs[0].dims.length);l.length>0&&(c=e.compute(_n(e.inputs[0],l),{inputs:[0],outputs:[-1]})[0],s=Tn(s.length,c.dims.length));let[u,d]=En(c.dims,s),f=u;i.keepDims&&(f=Dn(u,o)),e.compute(An(t,{hint:i.cacheKey,inputDependencies:[`type`]},[c],r,e.inputs[0].dataType,f,d),{inputs:[c]})},Mn=(e,t)=>{jn(e,`ReduceMeanShared`,t,`mean`)},Nn=(e,t)=>{jn(e,`ReduceL1Shared`,t,`l1`)},Pn=(e,t)=>{jn(e,`ReduceL2Shared`,t,`l2`)},Fn=(e,t)=>{jn(e,`ReduceLogSumExpShared`,t,`logSumExp`)},In=(e,t)=>{jn(e,`ReduceMaxShared`,t,`max`)},Ln=(e,t)=>{jn(e,`ReduceMinShared`,t,`min`)},Rn=(e,t)=>{jn(e,`ReduceProdShared`,t,`prod`)},zn=(e,t)=>{jn(e,`ReduceSumShared`,t,`sum`)},Bn=(e,t)=>{jn(e,`ReduceSumSquareShared`,t,`sumSquare`)},Vn=(e,t)=>{jn(e,`ReduceLogSumShared`,t,`logSum`)}}),Un,Wn,Gn,Kn,qn,Jn,Yn,Xn,Zn,Qn,$n,er,tr,nr,rr,ir,ar,or,sr,cr,lr,ur,dr,fr,pr,mr,hr=l(()=>{R(),U(),V(),Z(),Hn(),Un=e=>{if(!e||e.length===0||e.length>2)throw Error(`Reduce op requires 1 or 2 inputs.`);if(e.length===2&&e[1].dims.length!==1)throw Error(`Invalid axes input dims.`)},Wn=e=>[``,``,`var value = ${e.getByIndices(`input_indices`)};`,``],Gn=(e,t,n,r,i,a,o=!1,s=!1)=>{let c=[],l=n[0].dims,u=l.length,d=H.normalizeAxes(i,u),f=!s&&d.length===0;l.forEach((e,t)=>{f||d.indexOf(t)>=0?o&&c.push(1):c.push(e)});let p=c.length,m=H.size(c);return{name:e,shaderCache:t,getShaderSource:e=>{let t=[],i=Y(`_A`,n[0].dataType,u),s=X(`output`,a,p),c=r(i,s,d),m=c[2];for(let e=0,n=0;e<u;e++)f||d.indexOf(e)>=0?(o&&n++,m=`for(var j${e}: u32 = 0; j${e} < ${l[e]}; j${e}++) {
                  ${c[2].includes(`last_index`)?`let last_index = j${e};`:``}
                  ${i.indicesSet(`input_indices`,e,`j${e}`)}
                  ${m}
                }`):(t.push(`${i.indicesSet(`input_indices`,e,s.indicesGet(`output_indices`,n))};`),n++);return`

        ${e.registerUniform(`output_size`,`u32`).declareVariables(i,s)}

        ${e.mainStart()}
          ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
          var input_indices: ${i.type.indices};
          let output_indices = ${s.offsetToIndices(`global_idx`)};

          ${t.join(`
`)}
          ${c[0]}       // init ops for reduce max/min
          ${c[1]}
          ${m}
          ${c[3]}
          ${c.length===4?s.setByOffset(`global_idx`,`value`):c.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:c,dataType:a}],dispatchGroup:{x:Math.ceil(m/64)},programUniforms:[{type:12,data:m},...K(l,c)]})}},Kn=(e,t)=>{let n=[];return e[1].dims[0]>0&&e[1].getBigInt64Array().forEach(e=>n.push(Number(e))),B({axes:n,keepDims:t.keepDims,noopWithEmptyAxes:t.noopWithEmptyAxes})},qn=(e,t,n,r)=>{let i=e.inputs,a=i.length===1?n:Kn(i,n);e.compute(Gn(t,{hint:a.cacheKey,inputDependencies:[`rank`]},[i[0]],a.noopWithEmptyAxes&&a.axes.length===0?Wn:r,a.axes,i[0].dataType,a.keepDims,a.noopWithEmptyAxes),{inputs:[0]})},Jn=(e,t)=>{Un(e.inputs),qn(e,`ReduceLogSum`,t,(e,t)=>[`var value = ${t.type.storage}(0);`,``,`value += ${e.getByIndices(`input_indices`)};`,`value = log(value);`])},Yn=(e,t)=>{Un(e.inputs),qn(e,`ReduceL1`,t,(e,t)=>[`var value = ${t.type.storage}(0);`,``,`value += abs(${e.getByIndices(`input_indices`)});`,``])},Xn=(e,t)=>{Un(e.inputs),qn(e,`ReduceL2`,t,(e,t)=>[`var t = ${t.type.value}(0); var value = ${t.type.value}(0);`,``,`t = ${e.getByIndices(`input_indices`)}; value += (t * t);`,`value = sqrt(value);`])},Zn=(e,t)=>{Un(e.inputs),qn(e,`ReduceLogSumExp`,t,(e,t)=>[`var value = ${t.type.storage}(0);`,``,`value += exp(${e.getByIndices(`input_indices`)});`,`value = log(value);`])},Qn=(e,t)=>{Un(e.inputs),qn(e,`ReduceMax`,t,(e,t,n)=>{let r=[];for(let t=0;t<e.rank;t++)(n.indexOf(t)>=0||n.length===0)&&r.push(e.indicesSet(`input_indices`,t,0));return[`${r.join(`
`)}`,`var value = ${e.getByIndices(`input_indices`)};`,`value = max(value, ${e.getByIndices(`input_indices`)});`,``]})},$n=(e,t)=>{Un(e.inputs),qn(e,`ReduceMean`,t,(t,n,r)=>{let i=1;for(let n=0;n<t.rank;n++)(r.indexOf(n)>=0||r.length===0)&&(i*=e.inputs[0].dims[n]);return[`var sum = f32(0);`,``,`sum += f32(${t.getByIndices(`input_indices`)});`,`let value = ${n.type.value}(sum / ${i});`]})},er=(e,t)=>{Un(e.inputs),qn(e,`ReduceMin`,t,(e,t,n)=>{let r=[];for(let t=0;t<e.rank;t++)(n.indexOf(t)>=0||n.length===0)&&r.push(`input_indices[${t}] = 0;`);return[`${r.join(`
`)}`,`var value = ${e.getByIndices(`input_indices`)};`,`value = min(value, ${e.getByIndices(`input_indices`)});`,``]})},tr=(e,t)=>{Un(e.inputs),qn(e,`ReduceProd`,t,(e,t)=>[`var value = ${t.type.storage}(1);`,``,`value *= ${e.getByIndices(`input_indices`)};`,``])},nr=(e,t)=>{Un(e.inputs),qn(e,`ReduceSum`,t,(e,t)=>[`var value = ${t.type.storage}(0);`,``,`value += ${e.getByIndices(`input_indices`)};`,``])},rr=(e,t)=>{Un(e.inputs),qn(e,`ReduceSumSquare`,t,(e,t)=>[`var t = ${t.type.value}(0); var value = ${t.type.value}(0);`,``,`t = ${e.getByIndices(`input_indices`)}; value += t * t;`,``])},ir=(e,t,n)=>{if(t.length===0)return n;let r=1,i=1;for(let n=0;n<t.length;n++)t.indexOf(n)===-1?r*=e[n]:i*=e[n];return i<32&&r>1024},ar=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?$n(e,t):Mn(e,t)},or=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Yn(e,t):Nn(e,t)},sr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Xn(e,t):Pn(e,t)},cr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Zn(e,t):Fn(e,t)},lr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Qn(e,t):In(e,t)},ur=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?er(e,t):Ln(e,t)},dr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?tr(e,t):Rn(e,t)},fr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?nr(e,t):zn(e,t)},pr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?rr(e,t):Bn(e,t)},mr=(e,t)=>{ir(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Jn(e,t):Vn(e,t)}}),gr,_r,Q,vr,yr=l(()=>{R(),V(),hr(),gr=e=>{if(!e||e.length===0||e.length>2)throw Error(`ArgMinMaxOp op requires 1 or 2 inputs.`);if(e[0].dataType!==1)throw Error(`Invalid input type.`)},_r=(e,t)=>{gr(e.inputs),e.compute(Gn(`ArgMin`,{hint:t.cacheKey,inputDependencies:[`rank`]},[e.inputs[0]],(e,n,r)=>{let i=[];for(let t=0;t<e.rank;t++)(r.indexOf(t)>=0||r.length===0)&&i.push(`input_indices[${t}] = 0;`);return[`${i.join(`
`)}`,`var value = ${e.getByIndices(`input_indices`)};
var best_index : i32 = 0;`,`if (${e.getByIndices(`input_indices`)} ${t.selectLastIndex>0?`<=`:`<`} value) {
         value = ${e.getByIndices(`input_indices`)};
         best_index = i32(last_index);
       }`,``,n.setByOffset(`global_idx`,`best_index`)]},[t.axis],7,t.keepDims),{inputs:[0]})},Q=(e,t)=>{gr(e.inputs),e.compute(Gn(`argMax`,{hint:t.cacheKey,inputDependencies:[`rank`]},[e.inputs[0]],(e,n,r)=>{let i=[];for(let t=0;t<e.rank;t++)(r.indexOf(t)>=0||r.length===0)&&i.push(`input_indices[${t}] = 0;`);return[`${i.join(`
`)}`,`var value = ${e.getByIndices(`input_indices`)};
var best_index : i32 = 0;`,`if (${e.getByIndices(`input_indices`)} ${t.selectLastIndex>0?`>=`:`>`} value) {
         value = ${e.getByIndices(`input_indices`)};
         best_index = i32(last_index);
       }`,``,n.setByOffset(`global_idx`,`best_index`)]},[t.axis],7,t.keepDims),{inputs:[0]})},vr=e=>B(e)}),br,xr,Sr,Cr,wr,Tr,Er,Dr=l(()=>{R(),U(),Lt(),Z(),br=(e,t)=>{let n=e[0],r=e[1],i=e[2],a=e[3],o=e[4],s=e[5];if(o&&s)throw Error(`Attention cannot have both past and attention_bias`);if(n.dims.length!==3)throw Error(`Input "input" must have 3 dimensions`);let c=n.dims[0],l=n.dims[1],u=n.dims[2];if(i.dims.length!==1)throw Error(`Input "bias" is expected to have 1 dimensions`);if(r.dims.length!==2)throw Error(`Input "weights" is expected to have 2 dimensions`);if(r.dims[0]!==u)throw Error(`Input 1 dimension 0 should have same length as dimension 2 of input 0`);if(i.dims[0]!==r.dims[1])throw Error(`Input "bias" dimension 0 should have same length as dimension 1 of input "weights"`);let d=i.dims[0]/3,f=d,p=f;if(t.qkvHiddenSizes.length>0){if(t.qkvHiddenSizes.length!==3)throw Error(`qkv_hidden_sizes attribute should have 3 elements`);for(let e of t.qkvHiddenSizes)if(e%t.numHeads!==0)throw Error(`qkv_hidden_sizes should be divisible by num_heads`);d=t.qkvHiddenSizes[0],f=t.qkvHiddenSizes[1],p=t.qkvHiddenSizes[2]}let m=l;if(d!==f)throw Error(`qkv_hidden_sizes first element should be same as the second`);if(i.dims[0]!==d+f+p)throw Error(`Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes`);let h=0;if(o){if(f!==p)throw Error(`Input "past" expect k_hidden_size == v_hidden_size`);if(o.dims.length!==5)throw Error(`Input "past" must have 5 dimensions`);if(o.dims[0]!==2)throw Error(`Input "past" first dimension must be 2`);if(o.dims[1]!==c)throw Error(`Input "past" second dimension must be batch_size`);if(o.dims[2]!==t.numHeads)throw Error(`Input "past" third dimension must be num_heads`);if(o.dims[4]!==f/t.numHeads)throw Error(`Input "past" fifth dimension must be k_hidden_size / num_heads`);t.pastPresentShareBuffer||(h=o.dims[3])}let g=m+h;if(a)throw Error(`Mask not supported`);if(o)throw Error(`past is not supported`);if(s){if(s.dims.length!==4)throw Error(`Input "attention_bias" must have 4 dimensions`);if(s.dims[0]!==c||s.dims[1]!==t.numHeads||s.dims[2]!==l||s.dims[3]!==g)throw Error(`Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)`)}return{batchSize:c,sequenceLength:l,pastSequenceLength:h,kvSequenceLength:m,totalSequenceLength:g,maxSequenceLength:-1,inputHiddenSize:u,hiddenSize:d,vHiddenSize:p,headSize:Math.floor(d/t.numHeads),vHeadSize:Math.floor(p/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:0,scale:t.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},xr=(e,t,n)=>{let r=q(n),i=64,a=n/r;a<i&&(i=32);let o=Math.ceil(n/r/i),s=[{type:1,data:1/n},{type:12,data:a},{type:12,data:o}],c=W(e.dataType,r),l=G(1,r);return{name:`AttentionProbsSoftmax`,shaderCache:{hint:`${i};${c};${r}`,inputDependencies:[`type`]},getShaderSource:t=>{let n=X(`x`,e.dataType,e.dims,r),a=G(e.dataType);return`
  var<workgroup> thread_max: array<f32, ${i}>;
  var<workgroup> thread_sum: array<f32, ${i}>;
  ${t.registerUniforms([{name:`d_inv`,type:`f32`},{name:`d_comp`,type:`u32`},{name:`elements_per_thread`,type:`u32`}]).declareVariables(n)}
  ${t.mainStart([i,1,1])}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${i}) * uniforms.d_comp + local_offset;

    var thread_max_vector = ${l}(-3.402823e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
      thread_max_vector = max(${l}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(r){case 1:return`thread_max_vector`;case 2:return`max(thread_max_vector.x, thread_max_vector.y)`;case 4:return`max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))`;default:throw Error(`Unsupported components: ${r}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.402823e+38f);
    for (var i = 0u; i < ${i}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${l}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
      sum_vector += exp(${l}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(r){case 1:return`sum_vector`;case 2:return`sum_vector.x + sum_vector.y`;case 4:return`sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w`;default:throw Error(`Unsupported components: ${r}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${i}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
        x[offset + i] = ${n.type.value}(${a}(uniforms.d_inv));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
        var f32input = ${l}(x[offset + i]);
        x[offset + i] = ${n.type.value}(exp(f32input - max_value) / sum);
      }
    }
  }`},getRunData:()=>({outputs:[],dispatchGroup:{x:t},programUniforms:s})}},Sr=(e,t,n,r,i,a,o,s)=>{let c=s+a.kvSequenceLength,l=[a.batchSize,a.numHeads,a.sequenceLength,c],u=a.kvNumHeads===void 0&&e>1&&r,d=u?[a.batchSize,a.numHeads,c,a.headSize]:void 0,f=o.scale===0?1/Math.sqrt(a.headSize):o.scale,p=q(a.headSize),m=a.headSize/p,h={x:Math.ceil(c/12),y:Math.ceil(a.sequenceLength/12),z:a.batchSize*a.numHeads},g=[{type:12,data:a.sequenceLength},{type:12,data:m},{type:12,data:c},{type:12,data:a.numHeads},{type:1,data:f},{type:12,data:s},{type:12,data:a.kvSequenceLength}],_=u&&r&&H.size(r.dims)>0,v=[`type`,`type`];_&&v.push(`type`),i&&v.push(`type`);let y=[{dims:l,dataType:t.dataType,gpuDataType:0}];return u&&y.push({dims:d,dataType:t.dataType,gpuDataType:0}),{name:`AttentionProbs`,shaderCache:{hint:`${p};${i!==void 0};${r!==void 0};${e}`,inputDependencies:v},getRunData:()=>({outputs:y,dispatchGroup:h,programUniforms:g}),getShaderSource:e=>{let a=Y(`q`,t.dataType,t.dims,p),o=[a,Y(`key`,n.dataType,n.dims,p)];if(_){let e=Y(`past_key`,r.dataType,r.dims,p);o.push(e)}i&&o.push(Y(`attention_bias`,i.dataType,i.dims));let s=X(`output`,t.dataType,l),c=[s];u&&c.push(X(`present_key`,t.dataType,d,p));let f=G(1,p);return`
  const TILE_SIZE = 12u;

  var<workgroup> tileQ: array<${a.type.storage}, 144>;
  var<workgroup> tileK: array<${a.type.storage}, 144>;
  ${e.registerUniforms([{name:`M`,type:`u32`},{name:`K`,type:`u32`},{name:`N`,type:`u32`},{name:`num_heads`,type:`u32`},{name:`alpha`,type:`f32`},{name:`past_sequence_length`,type:`u32`},{name:`kv_sequence_length`,type:`u32`}]).declareVariables(...o,...c)}
  ${e.mainStart([12,12,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let qOffset = uniforms.M * uniforms.K * headIdx + m * uniforms.K;
    ${_&&u?`
    let kOffset = uniforms.kv_sequence_length * uniforms.K * headIdx;
    let pastKeyOffset = uniforms.past_sequence_length * uniforms.K * headIdx;`:`
    let kOffset = uniforms.N * uniforms.K * headIdx + n * uniforms.K;`}
    ${u?`let presentKeyOffset = headIdx * uniforms.N * uniforms.K;`:``}
    var value = ${f}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${_&&u?`
              if (n + local_id.y < uniforms.past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else {
                tileK[idx] =
                         key[kOffset + (n + local_id.y - uniforms.past_sequence_length) * uniforms.K + w + local_id.x];
              }`:`tileK[idx] = key[kOffset + local_id.y * uniforms.K + w + local_id.x];`}
      ${u?`present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];`:``}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
        value += ${f}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    let headOffset = headIdx * uniforms.M * uniforms.N;
    if (global_id.y < uniforms.M && global_id.x < uniforms.N) {
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch(p){case 1:return`value`;case 2:return`value.x + value.y`;case 4:return`value.x + value.y + value.z + value.w`;default:throw Error(`Unsupported components: ${p}`)}})()};
        output[outputIdx] = ${s.type.value} (sum * uniforms.alpha) + ${i?`attention_bias[outputIdx]`:`0.0`};
    }
  }`}}},Cr=(e,t,n,r,i,a)=>{let o=a+i.kvSequenceLength,s=i.nReps?i.nReps:1,c=i.vHiddenSize*s,l=i.kvNumHeads==null&&e>1&&r,u=l?[i.batchSize,i.numHeads,o,i.headSize]:void 0,d=[i.batchSize,i.sequenceLength,c],f={x:Math.ceil(i.vHeadSize/12),y:Math.ceil(i.sequenceLength/12),z:i.batchSize*i.numHeads},p=[{type:12,data:i.sequenceLength},{type:12,data:o},{type:12,data:i.vHeadSize},{type:12,data:i.numHeads},{type:12,data:c},{type:12,data:a},{type:12,data:i.kvSequenceLength}],m=l&&r&&H.size(r.dims)>0,h=[`type`,`type`];m&&h.push(`type`);let g=[{dims:d,dataType:t.dataType,gpuDataType:0}];return l&&g.push({dims:u,dataType:t.dataType,gpuDataType:0}),{name:`AttentionScore`,shaderCache:{hint:`${r!==void 0};${e}`,inputDependencies:h},getRunData:()=>({outputs:g,dispatchGroup:f,programUniforms:p}),getShaderSource:e=>{let i=Y(`probs`,t.dataType,t.dims),a=[i,Y(`v`,n.dataType,n.dims)];m&&a.push(Y(`past_value`,r.dataType,r.dims));let o=[X(`output`,t.dataType,d)];return l&&o.push(X(`present_value`,t.dataType,u)),`
  const TILE_SIZE = 12u;
  var<workgroup> tileQ: array<${i.type.value}, 144>;
  var<workgroup> tileK: array<${i.type.value}, 144>;
  ${e.registerUniforms([{name:`M`,type:`u32`},{name:`K`,type:`u32`},{name:`N`,type:`u32`},{name:`num_heads`,type:`u32`},{name:`v_hidden_size`,type:`u32`},{name:`past_sequence_length`,type:`u32`},{name:`kv_sequence_length`,type:`u32`}]).declareVariables(...a,...o)}
  ${e.mainStart([12,12,1])}
   let headIdx = workgroup_id.z;
   let m = global_id.y;
   let n = global_id.x;

   let offsetA = headIdx * (uniforms.M * uniforms.K) + m * uniforms.K;
   ${m&&l?`
    let pastValueOffset = headIdx * uniforms.N * uniforms.past_sequence_length + n;
    let vOffset = headIdx * uniforms.N * uniforms.kv_sequence_length + n;
      `:`
   let offsetB = headIdx * uniforms.N * uniforms.K + n;
            `}
    ${l?`let presentValueOffset = headIdx * uniforms.N * uniforms.K + n;`:``}
   var value = ${i.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${m&&l?`
        if (w + local_id.y < uniforms.past_sequence_length) {
          tileK[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else {
          tileK[idx] = v[vOffset + (w + local_id.y - uniforms.past_sequence_length) * uniforms.N];
        }
      `:`
        tileK[idx] = v[offsetB + (w + local_id.y) * uniforms.N];
      `}
        ${l?`present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileK[idx];`:``}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let currentBatchHeadNumber = workgroup_id.z % uniforms.num_heads;
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + currentBatchHeadNumber * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`}}},wr=(e,t,n,r,i,a,o,s,c,l,u)=>{let d=Math.min(e.outputCount,1+ +!!o+ +!!s),f=l.kvNumHeads!==void 0||d>1?l.pastSequenceLength:0,p=f+l.kvSequenceLength,m=c&&H.size(c.dims)>0?c:void 0,h=[t,n];l.kvNumHeads===void 0&&d>1&&o&&H.size(o.dims)>0&&h.push(o),m&&h.push(m);let g=e.compute(Sr(d,t,n,o,m,l,u,f),{inputs:h,outputs:l.kvNumHeads===void 0&&d>1?[-1,1]:[-1]})[0];e.compute(xr(g,l.batchSize*l.numHeads*l.sequenceLength,p),{inputs:[g],outputs:[]});let _=[g,r];l.kvNumHeads===void 0&&d>1&&s&&H.size(s.dims)>0&&_.push(s),e.compute(Cr(d,g,r,s,l,f),{inputs:_,outputs:l.kvNumHeads===void 0&&d>1?[0,2]:[0]})},Tr=(e,t)=>{let n=[t.batchSize,t.numHeads,t.sequenceLength,t.headSize],r=t.sequenceLength,i=t.inputHiddenSize,a=t.headSize,o={x:Math.ceil(t.headSize/12),y:Math.ceil(t.sequenceLength/12),z:t.batchSize*t.numHeads},s=[e.inputs[0],e.inputs[1],e.inputs[2]],c=[{type:12,data:r},{type:12,data:i},{type:12,data:a},{type:12,data:t.numHeads},{type:12,data:t.headSize},{type:12,data:t.hiddenSize},{type:12,data:t.hiddenSize+t.hiddenSize+t.vHiddenSize}];return e.compute({name:`AttentionPrepare`,shaderCache:{inputDependencies:[`type`,`type`,`type`]},getRunData:()=>({outputs:[{dims:n,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:n,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:n,dataType:e.inputs[0].dataType,gpuDataType:0}],dispatchGroup:o,programUniforms:c}),getShaderSource:e=>{let t=X(`output_q`,s[0].dataType,n),r=X(`output_k`,s[0].dataType,n),i=X(`output_v`,s[0].dataType,n),a=Y(`input`,s[0].dataType,s[0].dims),o=Y(`weight`,s[1].dataType,s[1].dims),c=Y(`bias`,s[2].dataType,s[2].dims),l=a.type.storage;return`
  const TILE_SIZE = 12u;
  var<workgroup> tileInput: array<${l}, 144>;
  var<workgroup> tileWeightQ: array<${l}, 144>;
  var<workgroup> tileWeightK: array<${l}, 144>;
  var<workgroup> tileWeightV: array<${l}, 144>;
  ${e.registerUniforms([{name:`M`,type:`u32`},{name:`K`,type:`u32`},{name:`N`,type:`u32`},{name:`num_heads`,type:`u32`},{name:`head_size`,type:`u32`},{name:`hidden_size`,type:`u32`},{name:`ldb`,type:`u32`}]).declareVariables(a,o,c,t,r,i)}
  ${e.mainStart([12,12,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${l}(0);
    var valueK = ${l}(0);
    var valueV = ${l}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`}},{inputs:s,outputs:[-1,-1,-1]})},Er=(e,t)=>{let n=br(e.inputs,t),[r,i,a]=Tr(e,n);return wr(e,r,i,a,e.inputs[4],void 0,void 0,void 0,e.inputs[5],n,t)}}),Or,kr,Ar,jr,Mr=l(()=>{Pe(),R(),U(),V(),Z(),Or=(e,t)=>{if(!e||e.length!==5)throw Error(`BatchNormalization requires 5 inputs`);let n=(e,t,n)=>{let r=t.length;if(r!==e.length)throw Error(`${n}: num dimensions != ${r}`);t.forEach((t,r)=>{if(t!==e[r])throw Error(`${n}: dim[${r}] do not match`)})};if(e[0].dims.length>1){let r=t.format===`NHWC`?t.spatial?e[0].dims.slice(-1):e[0].dims.slice(-1).concat(e[0].dims.slice(1,e[0].dims.length-1)):e[0].dims.slice(1,t.spatial?2:void 0);n(e[1].dims,r,`Invalid input scale`),n(e[2].dims,r,`Invalid input B`),n(e[3].dims,r,`Invalid input mean`),n(e[4].dims,r,`Invalid input var`)}else n(e[1].dims,[1],`Invalid input scale`),n(e[2].dims,[1],`Invalid input B`),n(e[3].dims,[1],`Invalid input mean`),n(e[4].dims,[1],`Invalid input var`)},kr=(e,t)=>{let{epsilon:n,spatial:r,format:i}=t,a=e[0].dims,o=r?q(a[a.length-1]):1,s=i===`NHWC`&&a.length>1?o:1,c=H.size(a)/o,l=r,u=l?a.length:a,d=Y(`x`,e[0].dataType,e[0].dims,o),f=Y(`scale`,e[1].dataType,e[1].dims,s),p=Y(`bias`,e[2].dataType,e[2].dims,s),m=Y(`inputMean`,e[3].dataType,e[3].dims,s),h=Y(`inputVar`,e[4].dataType,e[4].dims,s),g=X(`y`,e[0].dataType,u,o),_=()=>{let e=``;if(r)e=`let cOffset = ${a.length===1?`0u`:i===`NHWC`?`outputIndices[${a.length-1}] / ${o}`:`outputIndices[1]`};`;else if(i===`NCHW`)e=`
            ${g.indicesSet(`outputIndices`,`0`,`0`)}
            let cOffset = ${g.indicesToOffset(`outputIndices`)};`;else{e=`var cIndices = ${f.type.indices}(0);
                       cIndices[0] = outputIndices[${a.length-1}];`;for(let t=1;t<f.rank;t++)e+=`cIndices[${t}] = outputIndices[${t}];`;e+=`let cOffset = ${f.indicesToOffset(`cIndices`)};`}return e};return{name:`BatchNormalization`,shaderCache:{hint:`${t.epsilon}_${t.format}_${r}_${o}`,inputDependencies:l?[`rank`,`type`,`type`,`type`,`type`]:void 0},getShaderSource:e=>`
  const epsilon = ${n};
  ${e.registerUniform(`outputSize`,`u32`).declareVariables(d,f,p,m,h,g)}
  ${e.mainStart()}
  ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
    var outputIndices = ${g.offsetToIndices(`global_idx * ${o}`)};
    ${_()}
    let scale = ${f.getByOffset(`cOffset`)};
    let bias = ${p.getByOffset(`cOffset`)};
    let inputMean = ${m.getByOffset(`cOffset`)};
    let inputVar = ${h.getByOffset(`cOffset`)};
    let x = ${d.getByOffset(`global_idx`)};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${g.setByOffset(`global_idx`,`value`)}
  }`,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:l?[{type:12,data:c},...K(a)]:[{type:12,data:c}]})}},Ar=e=>B(e),jr=(e,t)=>{let{inputs:n,outputCount:r}=e,i=Ar({...t,outputCount:r});if(T.webgpu.validateInputContent&&Or(n,i),t.trainingMode)throw Error(`BatchNormalization trainingMode is not supported yet.`);e.compute(kr(n,i))}}),Nr,Pr,Fr,Ir=l(()=>{U(),Z(),Nr=e=>{if(e[0].dims.length!==3)throw Error(`input should have 3 dimensions`);if(![320,640,1280].includes(e[0].dims[2]))throw Error(`number of channels should be 320, 640 or 1280`);if(e[1].dims.length!==1)throw Error(`bias is expected to have 1 dimensions`);if(e[0].dims[2]!==e[1].dims[0])throw Error(`last dimension of input and bias are not the same`)},Pr=e=>{let t=e[0].dims,n=e[0].dims[2],r=H.size(t)/4,i=e[0].dataType,a=Y(`input`,i,t,4),o=Y(`bias`,i,[n],4),s=Y(`residual`,i,t,4),c=X(`output`,i,t,4);return{name:`BiasAdd`,getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(r/64)}}),getShaderSource:e=>`
  const channels = ${n}u / 4;
  ${e.declareVariables(a,o,s,c)}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(r)}
    let value = ${a.getByOffset(`global_idx`)}
      + ${o.getByOffset(`global_idx % channels`)} + ${s.getByOffset(`global_idx`)};
    ${c.setByOffset(`global_idx`,`value`)}
  }`}},Fr=e=>{Nr(e.inputs),e.compute(Pr(e.inputs))}}),Lr,$,Rr,zr,Br,Vr,Hr,Ur,Wr,Gr,Kr,qr,Jr,Yr,Xr,Zr,Qr,$r,ei,ti,ni,ri,ii,ai,oi,si,ci,li,ui,di,fi,pi,mi,hi,gi,_i,vi,yi,bi,xi,Si,Ci,wi,Ti,Ei,Di=l(()=>{R(),U(),V(),Z(),Lr=(e,t,n,r,i,a,o)=>{let s=Math.ceil(t/4),c=``;c=typeof i==`string`?`${i}(a)`:i(`a`);let l=Y(`inputData`,n,[s],4),u=X(`outputData`,r,[s],4),d=[{name:`vec_size`,type:`u32`}];return o&&d.push(...o),`
      ${e.registerUniforms(d).declareVariables(l,u)}

  ${a??``}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.vec_size`)}

    let a = ${l.getByOffset(`global_idx`)};
    ${u.setByOffset(`global_idx`,c)}
  }`},$=(e,t,n,r,i,a=e.dataType,o,s)=>{let c=[{type:12,data:Math.ceil(H.size(e.dims)/4)}];return o&&c.push(...o),{name:t,shaderCache:{hint:i,inputDependencies:[`type`]},getShaderSource:t=>Lr(t,H.size(e.dims),e.dataType,a,n,r,s),getRunData:t=>({outputs:[{dims:e.dims,dataType:a}],dispatchGroup:{x:Math.ceil(H.size(t[0].dims)/64/4)},programUniforms:c})}},Rr=e=>{e.compute($(e.inputs[0],`Abs`,`abs`))},zr=e=>{e.compute($(e.inputs[0],`Acos`,`acos`))},Br=e=>{e.compute($(e.inputs[0],`Acosh`,`acosh`))},Vr=e=>{e.compute($(e.inputs[0],`Asin`,`asin`))},Hr=e=>{e.compute($(e.inputs[0],`Asinh`,`asinh`))},Ur=e=>{e.compute($(e.inputs[0],`Atan`,`atan`))},Wr=e=>{e.compute($(e.inputs[0],`Atanh`,`atanh`))},Gr=e=>B(e),Kr=(e,t)=>{let n;switch(t.to){case 10:n=`vec4<f16>`;break;case 1:n=`vec4<f32>`;break;case 12:n=`vec4<u32>`;break;case 6:n=`vec4<i32>`;break;case 9:n=`vec4<bool>`;break;default:throw RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`)}e.compute($(e.inputs[0],`Cast`,n,void 0,t.cacheKey,t.to))},qr=e=>{let t,n,r=e.length>=2&&e[1].data!==0,i=e.length>=3&&e[2].data!==0;switch(e[0].dataType){case 1:t=r?e[1].getFloat32Array()[0]:-34028234663852886e22,n=i?e[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:t=r?e[1].getUint16Array()[0]:64511,n=i?e[2].getUint16Array()[0]:31743;break;default:throw Error(`Unsupport data type`)}return B({min:t,max:n})},Jr=(e,t)=>{let n=t||qr(e.inputs),r=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`Clip`,e=>`clamp(${e}, vec4<${r}>(uniforms.min), vec4<${r}>(uniforms.max))`,void 0,n.cacheKey,void 0,[{type:e.inputs[0].dataType,data:n.min},{type:e.inputs[0].dataType,data:n.max}],[{name:`min`,type:r},{name:`max`,type:r}]),{inputs:[0]})},Yr=e=>{e.compute($(e.inputs[0],`Ceil`,`ceil`))},Xr=e=>{e.compute($(e.inputs[0],`Cos`,`cos`))},Zr=e=>{e.compute($(e.inputs[0],`Cosh`,`cosh`))},Qr=e=>B(e),$r=(e,t)=>{let n=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`Elu`,e=>`elu_vf32(${e})`,`
  const elu_alpha_ = ${n}(${t.alpha});

  fn elu_f32(a: ${n}) -> ${n} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${n}>) -> vec4<${n}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,t.cacheKey))},ei=(e=`f32`)=>`
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,ti=e=>{let t=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`Erf`,e=>`erf_vf32(${e})`,ei(t)))},ni=e=>{e.compute($(e.inputs[0],`Exp`,`exp`))},ri=e=>{e.compute($(e.inputs[0],`Floor`,`floor`))},ii=e=>{let t=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`Gelu`,e=>`0.5 * ${e} * (1.0 + erf_vf32(${e} * 0.7071067811865475))`,ei(t)))},ai=(e,t)=>{let n=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`LeakyRelu`,e=>`select(leaky_relu_alpha_ * ${e}, ${e}, ${e} >= vec4<${n}>(0.0))`,`const leaky_relu_alpha_ = ${n}(${t.alpha});`,t.cacheKey))},oi=e=>{e.compute($(e.inputs[0],`Not`,e=>`!${e}`))},si=e=>{e.compute($(e.inputs[0],`Neg`,e=>`-${e}`))},ci=e=>{e.compute($(e.inputs[0],`Reciprocal`,e=>`1.0/${e}`))},li=e=>{let t=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`Relu`,e=>`select(vec4<${t}>(0.0), ${e}, ${e} > vec4<${t}>(0.0))`))},ui=e=>{e.compute($(e.inputs[0],`Sigmoid`,e=>`(1.0 / (1.0 + exp(-${e})))`))},di=e=>B(e),fi=(e,t)=>{let n=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`HardSigmoid`,e=>`max(vec4<${n}>(0.0), min(vec4<${n}>(1.0), ${t.alpha} * ${e} + vec4<${n}>(${t.beta})))`,void 0,t.cacheKey))},pi=e=>{e.compute($(e.inputs[0],`Sin`,`sin`))},mi=e=>{e.compute($(e.inputs[0],`Sinh`,`sinh`))},hi=e=>{e.compute($(e.inputs[0],`Sqrt`,`sqrt`))},gi=e=>{e.compute($(e.inputs[0],`Tan`,`tan`))},_i=e=>`sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`,vi=e=>{e.compute($(e.inputs[0],`Tanh`,_i))},yi=(e=`f32`)=>`
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${_i(`v`)};
}
`,bi=e=>`(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`,xi=e=>{let t=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`FastGelu`,bi,yi(t),void 0,e.inputs[0].dataType))},Si=(e,t)=>{let n=G(e.inputs[0].dataType);return e.compute($(e.inputs[0],`ThresholdedRelu`,e=>`select(vec4<${n}>(0.0), ${e}, ${e} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${n}>(${t.alpha});`,t.cacheKey)),0},Ci=e=>{e.compute($(e.inputs[0],`Log`,`log`))},wi=(e,t)=>`
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,Ti=e=>`quick_gelu_impl(${e})`,Ei=(e,t)=>{let n=G(e.inputs[0].dataType);e.compute($(e.inputs[0],`QuickGelu`,Ti,wi(n,t.alpha),t.cacheKey,e.inputs[0].dataType))}}),Oi,ki,Ai,ji=l(()=>{U(),Z(),Di(),Oi=e=>{if(e[0].dims.length!==3)throw Error(`input should have 3 dimensions`);if(![2560,5120,10240].includes(e[0].dims[2]))throw Error(`hidden state should be 2560, 5120 or 10240`);if(e[1].dims.length!==1)throw Error(`bias is expected to have 1 dimensions`);if(e[0].dims[2]!==e[1].dims[0])throw Error(`last dimension of input and bias are not the same`)},ki=e=>{let t=e[0].dims.slice();t[2]/=2;let n=Y(`input`,e[0].dataType,e[0].dims,4),r=Y(`bias`,e[0].dataType,[e[0].dims[2]],4),i=X(`output`,e[0].dataType,t,4),a=H.size(t)/4,o=W(e[0].dataType);return{name:`BiasSplitGelu`,getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(a/64)}}),getShaderSource:t=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2]/4/2}u;

  ${t.declareVariables(n,r,i)}

  ${ei(o)}

  ${t.mainStart()}
    ${t.guardAgainstOutOfBoundsWorkgroupSizes(a)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${i.setByOffset(`global_idx`,`valueLeft * geluRight`)}
  }`}},Ai=e=>{Oi(e.inputs),e.compute(ki(e.inputs))}}),Mi,Ni,Pi,Fi,Ii,Li,Ri,zi,Bi,Vi,Hi,Ui,Wi,Gi=l(()=>{R(),U(),Z(),Mi=(e,t,n,r,i,a,o,s,c,l,u,d)=>{let f,p;typeof s==`string`?f=p=(e,t)=>`${s}((${e}),(${t}))`:typeof s==`function`?f=p=s:(f=s.scalar,p=s.vector);let m=X(`outputData`,u,r.length,4),h=Y(`aData`,c,t.length,4),g=Y(`bData`,l,n.length,4),_;if(i)if(a){let e=H.size(t)===1,r=H.size(n)===1,i=t.length>0&&t[t.length-1]%4==0,a=n.length>0&&n[n.length-1]%4==0;_=e||r?m.setByOffset(`global_idx`,p(e?`${h.type.value}(${h.getByOffset(`0`)}.x)`:h.getByOffset(`global_idx`),r?`${g.type.value}(${g.getByOffset(`0`)}.x)`:g.getByOffset(`global_idx`))):`
            let outputIndices = ${m.offsetToIndices(`global_idx * 4u`)};
            let offsetA = ${h.broadcastedIndicesToOffset(`outputIndices`,m)};
            let offsetB = ${g.broadcastedIndicesToOffset(`outputIndices`,m)};
            ${m.setByOffset(`global_idx`,p(o||i?h.getByOffset(`offsetA / 4u`):`${h.type.value}(${h.getByOffset(`offsetA / 4u`)}[offsetA % 4u])`,o||a?g.getByOffset(`offsetB / 4u`):`${g.type.value}(${g.getByOffset(`offsetB / 4u`)}[offsetB % 4u])`))}
          `}else _=m.setByOffset(`global_idx`,p(h.getByOffset(`global_idx`),g.getByOffset(`global_idx`)));else{if(!a)throw Error(`no necessary to use scalar implementation for element-wise binary op implementation.`);let e=(e,t,n=``)=>{let r=`aData[indexA${t}][componentA${t}]`,i=`bData[indexB${t}][componentB${t}]`;return`
            let outputIndices${t} = ${m.offsetToIndices(`global_idx * 4u + ${t}u`)};
            let offsetA${t} = ${h.broadcastedIndicesToOffset(`outputIndices${t}`,m)};
            let offsetB${t} = ${g.broadcastedIndicesToOffset(`outputIndices${t}`,m)};
            let indexA${t} = offsetA${t} / 4u;
            let indexB${t} = offsetB${t} / 4u;
            let componentA${t} = offsetA${t} % 4u;
            let componentB${t} = offsetB${t} % 4u;
            ${e}[${t}] = ${n}(${f(r,i)});
          `};_=u===9?`
            var data = vec4<u32>(0);
            ${e(`data`,0,`u32`)}
            ${e(`data`,1,`u32`)}
            ${e(`data`,2,`u32`)}
            ${e(`data`,3,`u32`)}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:`
            ${e(`outputData[global_idx]`,0)}
            ${e(`outputData[global_idx]`,1)}
            ${e(`outputData[global_idx]`,2)}
            ${e(`outputData[global_idx]`,3)}
          `}return`
        ${e.registerUniform(`vec_size`,`u32`).declareVariables(h,g,m)}

        ${d??``}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.vec_size`)}
        ${_}
      }`},Ni=(e,t,n,r,i,a,o=n.dataType)=>{let s=!H.areEqual(n.dims,r.dims),c=n.dims,l=H.size(n.dims),u=!1,d=!1,f=[s];if(s){let e=Xt.calcShape(n.dims,r.dims,!1);if(!e)throw Error(`Can't perform binary op on the given tensors`);c=e,l=H.size(c);let t=H.size(n.dims)===1,i=H.size(r.dims)===1,a=n.dims.length>0&&n.dims[n.dims.length-1]%4==0,o=r.dims.length>0&&r.dims[r.dims.length-1]%4==0;f.push(t),f.push(i),f.push(a),f.push(o);let s=1;for(let e=1;e<c.length;e++){let t=n.dims[n.dims.length-e]??1;if(t===(r.dims[r.dims.length-e]??1))s*=t;else break}s%4==0?(d=!0,u=!0):(t||i||a||o)&&(u=!0)}else u=!0;return f.push(u),{name:e,shaderCache:{hint:t+f.map(e=>e.toString()).join(`_`),inputDependencies:[`rank`,`rank`]},getShaderSource:e=>Mi(e,n.dims,r.dims,c,u,s,d,i,n.dataType,r.dataType,o,a),getRunData:()=>({outputs:[{dims:c,dataType:o}],dispatchGroup:{x:Math.ceil(l/64/4)},programUniforms:[{type:12,data:Math.ceil(H.size(c)/4)},...K(n.dims,r.dims,c)]})}},Pi=(e,t,n,r,i,a)=>{e.compute(Ni(t,i??``,e.inputs[0],e.inputs[1],n,r,a))},Fi=e=>{Pi(e,`Add`,(e,t)=>`${e}+${t}`)},Ii=e=>{Pi(e,`Div`,(e,t)=>`${e}/${t}`)},Li=e=>{Pi(e,`Equal`,{scalar:(e,t)=>`u32(${e}==${t})`,vector:(e,t)=>`vec4<u32>(${e}==${t})`},void 0,void 0,9)},Ri=e=>{Pi(e,`Mul`,(e,t)=>`${e}*${t}`)},zi=e=>{let t=Y(`input`,e.inputs[0].dataType,e.inputs[0].dims).type.value;Pi(e,`Pow`,{scalar:(e,t)=>`pow_custom(${e},${t})`,vector:(e,t)=>`pow_vector_custom(${e},${t})`},`
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t===`i32`?`round`:``}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},Bi=e=>{Pi(e,`Sub`,(e,t)=>`${e}-${t}`)},Vi=e=>{Pi(e,`Greater`,{scalar:(e,t)=>`u32(${e}>${t})`,vector:(e,t)=>`vec4<u32>(${e}>${t})`},void 0,void 0,9)},Hi=e=>{Pi(e,`Less`,{scalar:(e,t)=>`u32(${e}<${t})`,vector:(e,t)=>`vec4<u32>(${e}<${t})`},void 0,void 0,9)},Ui=e=>{Pi(e,`GreaterOrEqual`,{scalar:(e,t)=>`u32(${e}>=${t})`,vector:(e,t)=>`vec4<u32>(${e}>=${t})`},void 0,void 0,9)},Wi=e=>{Pi(e,`LessOrEqual`,{scalar:(e,t)=>`u32(${e}<=${t})`,vector:(e,t)=>`vec4<u32>(${e}<=${t})`},void 0,void 0,9)}}),Ki,qi,Ji,Yi,Xi,Zi,Qi=l(()=>{R(),U(),V(),Z(),Ki=(e,t)=>{if(!e||e.length<1)throw Error(`too few inputs`);let n=e[0],r=n.dataType,i=n.dims.length;e.forEach((e,a)=>{if(a!==0){if(e.dataType!==r)throw Error(`input tensors should be one type`);if(e.dims.length!==i)throw Error(`input tensors should have the same shape`);e.dims.forEach((e,r)=>{if(r!==t&&e!==n.dims[r])throw Error(`non concat dimensions must match`)})}})},qi=(e,t)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`,Ji=(e,t)=>{let n=e.length,r=[];for(let i=0;i<n;++i){let a=t.setByOffset(`global_idx`,e[i].getByIndices(`indices`));n===1?r.push(a):i===0?r.push(`if (inputIndex == ${i}u) { ${a} }`):i===n-1?r.push(`else { ${a} }`):r.push(`else if (inputIndex == ${i}) { ${a} }`)}return r.join(`
`)},Yi=(e,t,n,r)=>{let i=H.size(n),a=Array(e.length),o=Array(e.length),s=0,c=[],l=[],u=[{type:12,data:i}];for(let n=0;n<e.length;++n)s+=e[n].dims[t],a[n]=s,l.push(e[n].dims.length),o[n]=Y(`input${n}`,r,l[n]),c.push(`rank`),u.push({type:12,data:a[n]});for(let t=0;t<e.length;++t)u.push(...K(e[t].dims));u.push(...K(n));let d=X(`output`,r,n.length),f=d.indicesGet(`indices`,t),p=Array.from(Array(a.length).keys()).map(e=>`uniforms.sizeInConcatAxis${e}`).join(`,`);return{name:`Concat`,shaderCache:{hint:`${t}`,inputDependencies:c},getRunData:()=>({outputs:[{dims:n,dataType:r}],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:u}),getShaderSource:t=>`

  ${(()=>{t.registerUniform(`outputSize`,`u32`);for(let n=0;n<e.length;n++)t.registerUniform(`sizeInConcatAxis${n}`,`u32`);return t.declareVariables(...o,d)})()}

  ${qi(a.length,p)}

  ${t.mainStart()}
    ${t.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}

    var indices = ${d.offsetToIndices(`global_idx`)};

    let inputIndex = calculateInputIndex(${f});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${a.length}u>(${p});
      ${f} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${Ji(o,d)}
  }`}},Xi=(e,t)=>{let n=e.inputs,r=n[0].dims,i=H.normalizeAxis(t.axis,r.length);Ki(n,i);let a=r.slice();a[i]=n.reduce((e,t)=>e+(t.dims.length>i?t.dims[i]:0),0);let o=n.filter(e=>H.size(e.dims)>0);e.compute(Yi(o,i,a,n[0].dataType),{inputs:o})},Zi=e=>B({axis:e.axis})}),$i,ea,ta,na,ra=l(()=>{R(),U(),$i=(e,t,n=`f32`)=>{switch(e.activation){case`Relu`:return`value = max(value, ${t}(0.0));`;case`Sigmoid`:return`value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;case`Clip`:return`value = clamp(value, ${t}(${n}(uniforms.clip_min)), ${t}(${n}(uniforms.clip_max)));`;case`HardSigmoid`:return`value = max(${t}(0.0), min(${t}(1.0), ${n}(uniforms.alpha) * value + ${n}(uniforms.beta)));`;case`LeakyRelu`:return`value = select(${n}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;case`Tanh`:return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case``:return``;default:throw Error(`Unsupported activation ${e.activation}`)}},ea=(e,t)=>{e.activation===`Clip`?t.push({type:1,data:e.clipMax},{type:1,data:e.clipMin}):e.activation===`HardSigmoid`?t.push({type:1,data:e.alpha},{type:1,data:e.beta}):e.activation===`LeakyRelu`&&t.push({type:1,data:e.alpha})},ta=(e,t)=>{e.activation===`Clip`?t.push({name:`clip_max`,type:`f32`},{name:`clip_min`,type:`f32`}):e.activation===`HardSigmoid`?t.push({name:`alpha`,type:`f32`},{name:`beta`,type:`f32`}):e.activation===`LeakyRelu`&&t.push({name:`alpha`,type:`f32`})},na=e=>{let t=e?.activation||``;if(t===`HardSigmoid`){let[n,r]=e?.activation_params||[.2,.5];return{activation:t,alpha:n,beta:r}}else if(t===`Clip`){let[n,r]=e?.activation_params||[$t,en];return{activation:t,clipMax:r,clipMin:n}}else if(t===`LeakyRelu`){let[n]=e?.activation_params||[.01];return{activation:t,alpha:n}}return{activation:t}}}),ia,aa,oa=l(()=>{ia=(e,t)=>{switch(e){case 1:return t;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw Error(`${e}-component is not supported.`)}},aa=e=>`
      ${e?`value = value + getBiasByOutputCoords(coords);`:``}
      `}),sa,ca=l(()=>{sa=e=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`}),la,ua,da,fa,pa,ma,ha,ga,_a=l(()=>{R(),U(),Z(),ra(),oa(),la=(e,t)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t?`, batchIndices`:``});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t?`, batchIndices`:``});
        `,ua=(e,t)=>e?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t===3?``:`let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];`}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t===3?``:`acc[i] = BCached3 * ACached3[i] + acc[i];`}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t===3?``:`acc[i] = BCached3 * ACached.w + acc[i];`}
        }`,da=(e,t,n=`f32`,r,i=!1,a=32,o=!1,s=32)=>{let c=t[1]*e[1],l=t[0]*e[0],u=i?c:a,d=i?a:c,f=u/t[0],p=a/t[1];if(!((i&&f===4&&e[1]===4||!i&&(f===3||f===4))&&u%t[0]===0&&a%t[1]===0&&e[0]===4))throw Error(`If transposeA ${i} is true, innerElementSize ${f} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${f} must be 3 or 4.
  tileAWidth ${u} must be divisible by workgroupSize[0]${t[0]}. tileInner ${a} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${f}<${n}>, ${u/f}>, ${d}>;
var<workgroup> mm_Bsub: array<array<vec4<${n}>, ${l/e[0]}>, ${a}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${f};
const tileInner = ${a};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${o?`0`:`i32(globalId.z)`};
  ${r?`let batchIndices = ${r.offsetToIndices(`u32(batch)`)};`:``}
  let globalRowStart = i32(workgroupId.y) * ${c};

  let num_tiles = ${o?`${Math.ceil(s/a)}`:`(uniforms.dim_inner - 1) / tileInner + 1`};
  var kStart = ${o?`i32(globalId.z) * ${s}`:`0`};

  var acc: array<vec4<${n}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${p};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${la(i,r)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${p}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${r?`, batchIndices`:``});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${f===3?``:`let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];`}

          ${ua(i,f)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},fa=(e,t)=>e?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t?`, batchIndices`:``});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t?`, batchIndices`:``});
            `,pa=e=>e?`let ACached = mm_Asub[k][tileRow + innerRow];`:`let ACached = mm_Asub[tileRow + innerRow][k];`,ma=(e,t,n=`f32`,r,i=!1,a=32,o=!1,s=32,c=!1)=>{let l=e[1]*t[1],u=e[0]*t[0],d=i?l:a,f=i?a:l;if(!(f%t[1]===0&&d%t[0]===0&&a%t[1]===0))throw Error(`tileAHight ${f} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${d} must be divisible by workgroupSize[0]${t[0]}, tileInner ${a} must be divisible by workgroupSize[1]${t[1]}`);let p=f/t[1],m=d/t[0],h=a/t[1],g=c?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${l};
    let globalColStart = i32(workgroupId.x) * ${u};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${f}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${d}; inputCol = inputCol + ${t[0]}) {
          ${fa(i,r)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${a}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${u}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${r?`, batchIndices`:``});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${n}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${i?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${l};

let tileRowA = i32(localId.y) * ${p};
let tileColA = i32(localId.x) * ${m};
let tileRowB = i32(localId.y) * ${h};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${p}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${m}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${fa(i,r)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${h}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${r?`, batchIndices`:``});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${n}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${pa(i)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${n}, ${d}>, ${f}>;
  var<workgroup> mm_Bsub : array<array<${n}, ${u}>, ${a}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${a};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${o?`0`:`i32(globalId.z)`};
    ${r?`let batchIndices = ${r.offsetToIndices(`u32(batch)`)};`:``}
    let num_tiles = ${o?`${Math.ceil(s/a)}`:`(uniforms.dim_inner - 1) / tileInner + 1`};
    var kStart = ${o?`i32(globalId.z) * ${s}`:`0`};

    var acc : array<array<${n}, colPerThread>, rowPerThread>;
    ${g}
  }
`},ha=(e,t,n,r,i,a=!1)=>{let[o,s,c]=i,[l,u,d,f]=r,p=dn(o,c),m=dn(s,c),h=W(r[0].type.tensor);return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${l.type.indices}) -> ${ia(e,h)} {
      var value = ${ia(e,h)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        ${(()=>{let e=u.rank,t=l.rank,n=`var aIndices: ${u.type.indices};`;for(let r=e-2-1,i=t-1;r>=0;r--,i--)n+=`
aIndices[${r}] = ${t>1?`batchIndices[${i}]`:`batchIndices`};`;return p.forEach(e=>{n+=`
aIndices[${e}] = 0;`}),n+=`
aIndices[${e-2}] = u32(row);
                   aIndices[${e-1}] = u32(colIn);`,n})()}
        value = ${u.getByIndices(`aIndices`)};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${l.type.indices}) -> ${ia(e,h)} {
      var value = ${ia(e,h)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        ${(()=>{let e=d.rank,t=l.rank,n=`var bIndices: ${d.type.indices};`;for(let r=e-2-1,i=t-1;r>=0;r--,i--)n+=`
bIndices[${r}] = ${t>1?`batchIndices[${i}]`:`batchIndices`};`;return m.forEach(e=>{n+=`
bIndices[${e}] = 0;`}),n+=`
bIndices[${e-2}] = u32(row);
                   bIndices[${e-1}] = u32(colIn);`,n})()}
        value = ${d.getByIndices(`bIndices`)};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${ia(e,h)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t?`value = value + ${a?`bias[colIn]`:`${ia(e,h)}(bias[row])`};`:``}
        ${n}
        ${f.setByIndices(`vec3<u32>(coords)`,`value`)}
      }
    }
    `},ga=(e,t,n,r,i=!1,a)=>{let o=e[0].dims,s=e[1].dims,c=o.slice(0,-2),l=s.slice(0,-2),u=r?r.slice(0,-2):n.slice(0,-2),d=H.size(u),f=o[o.length-2],p=o[o.length-1],m=s[s.length-1],h=p%4==0&&m%4==0,g=f<=8?[4,1,1]:[4,4,1],_=[8,8,1],v=[Math.ceil(m/_[0]/g[0]),Math.ceil(f/_[1]/g[1]),Math.ceil(d/_[2]/g[2])],y=h?4:1,b=[...c,f,p/y],x=b.length,S=[...l,p,m/y],C=S.length,w=[d,f,m/y],T=[{type:6,data:f},{type:6,data:m},{type:6,data:p}];ea(t,T),T.push(...K(u,b,S));let E=[`rank`,`rank`],D=e.length>2;return D&&(T.push(...K(e[2].dims)),E.push(`rank`)),T.push(...K(w)),{name:`MatMul`,shaderCache:{hint:`${g};${t.activation};${h};${i}`,inputDependencies:E},getRunData:()=>({outputs:[{dims:a?a(n):n,dataType:e[0].dataType}],dispatchGroup:{x:v[0],y:v[1],z:v[2]},programUniforms:T}),getShaderSource:n=>{let r=u.length,a=cn(`batchDims`,e[0].dataType,r,1),o=W(e[0].dataType),s=Y(`a`,e[0].dataType,x,y),d=Y(`b`,e[1].dataType,C,y),f=X(`result`,e[0].dataType,w.length,y),p=[s,d];if(D){let t=i?y:1;p.push(Y(`bias`,e[2].dataType,e[2].dims.length,t))}let m=[{name:`dim_a_outer`,type:`i32`},{name:`dim_b_outer`,type:`i32`},{name:`dim_inner`,type:`i32`}];ta(t,m);let v=W(f.type.tensor),b=$i(t,f.type.value,v),S=ha(y,D,b,[a,s,d,f],[c,l,u],i);return`
  ${n.registerUniforms(m).registerInternalVariables(a).declareVariables(...p,f)}
  ${S}
  ${h?da(g,_,o,a):ma(g,_,o,a)}
                   `}}}}),va,ya,ba=l(()=>{R(),Pt(),Z(),ra(),oa(),ca(),_a(),va=(e,t,n,r,i=!1,a,o=4,s=4,c=4,l=`f32`)=>{let u=e=>{switch(e){case 1:return`resData = x[xIndex];`;case 3:return`resData = vec3<${l}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return`resData = x[xIndex / 4];`;default:throw Error(`innerElementSize ${e} is not supported.`)}},d=e=>{switch(e){case 1:return`return w[row * i32(uniforms.w_shape[3]) + colIn];`;case 4:return`return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];`;default:throw Error(`innerElementSize ${e} is not supported.`)}},f=e?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,p=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,m=e?`i32(uniforms.x_shape[1])`:`i32(uniforms.x_shape[2])`,h=e?`i32(uniforms.x_shape[2])`:`i32(uniforms.x_shape[3])`,g=e?`row`:`col`,_=e?`col`:`row`,v=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e?`i32(uniforms.result_shape[2])`:`i32(uniforms.result_shape[3])`};
    let outRow = ${g} / outWidth;
    let outCol = ${g} % outWidth;

    let WRow = ${_} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${_} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${_} % inChannels;
    var resData = ${ia(o,l)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${m} && xCol >= 0 && xCol < ${h}) {
      ${f}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${u(o)}
    }
    return resData;`,y=e?t&&r?`
    let col = colIn * ${o};
    ${v}`:`
    let col = colIn * ${o};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${v}
    }
    return ${ia(o,l)}(0.0);`:r&&n?`
    let col = colIn * ${o};
    ${v}`:`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${v}
    }
    return ${ia(o,l)}(0.0);`,b=`${d(s)}`,x=ia(c,l),S=ia(e?o:s,l),C=ia(e?s:o,l),w=$i(a,x,l);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${S} {
      ${e?y:b}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${C} {
      ${e?b:y}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${x}) {
      let col = colIn * ${c};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e?`i32(uniforms.result_shape[2])`:`i32(uniforms.result_shape[3])`};
      ${p}
      ${aa(i)}
      ${w}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},ya=(e,t,n,r,i,a,o,s,c)=>{let l=t.format===`NHWC`,u=l?e[0].dims[3]:e[0].dims[1],d=n[0],f=l?n[2]:n[3],p=l?n[1]:n[2],m=l?n[3]:n[1],h=l&&(u%4==0||u%3==0)&&m%4==0,g=l?m:f*p,_=l?f*p:m,v=[8,8,1],y=r<=8?[4,1,1]:[4,4,1],b=[Math.ceil(g/v[0]/y[0]),Math.ceil(_/v[1]/y[1]),Math.ceil(d/v[2]/y[2])];z(`verbose`,()=>`[conv2d_mm_webgpu] dispatch = ${b}`);let x=h?l&&u%4!=0?3:4:1,S=v[1]*y[1],C=v[0]*y[0],w=Math.max(v[0]*x,v[1]),T=r%S===0,E=i%C===0,D=a%w===0,O=h?[x,4,4]:[1,1,1],k=[{type:6,data:r},{type:6,data:i},{type:6,data:a},{type:6,data:[t.pads[0],t.pads[1]]},{type:6,data:t.strides},{type:6,data:t.dilations}];ea(t,k),k.push(...K(e[0].dims,e[1].dims));let ee=[`rank`,`rank`];return o&&(k.push(...K(e[2].dims)),ee.push(`rank`)),k.push(...K(n)),{name:`Conv2DMatMul`,shaderCache:{hint:`${t.cacheKey};${x};${h};${T};${E};${D};${S};${C};${w}`,inputDependencies:ee},getRunData:()=>({outputs:[{dims:c?c(n):n,dataType:e[0].dataType}],dispatchGroup:{x:b[0],y:b[1],z:b[2]},programUniforms:k}),getShaderSource:r=>{let i=[{name:`dim_a_outer`,type:`i32`},{name:`dim_b_outer`,type:`i32`},{name:`dim_inner`,type:`i32`},{name:`pad`,type:`i32`,length:2},{name:`stride`,type:`i32`,length:2},{name:`dilation`,type:`i32`,length:2}];ta(t,i);let a=h?4:1,c=W(e[0].dataType),u=`
      fn setOutputAtIndex(flatIndex : i32, value : ${h?`vec4<${c}>`:c}) {
        result[flatIndex] = ${h?`vec4<${c}>`:c}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${h?`vec4<${c}>`:c}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${h?`/ 4`:``}, value);
      }`,d=[Y(`x`,e[0].dataType,e[0].dims.length,x===3?1:x),Y(`w`,e[1].dataType,e[1].dims.length,a)],f=X(`result`,e[0].dataType,n.length,a);if(o){let t=Y(`bias`,e[2].dataType,e[2].dims.length,a);d.push(t),u+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${h?`vec4<${c}>`:c} {
          return bias[coords.${l?`w`:`y`}${h?`/ 4`:``}];
        }`}return`
        ${sa(`uniforms.result_strides`)}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${r.registerUniforms(i).declareVariables(...d,f)}
        ${u}
        ${va(l,T,E,D,o,t,O[0],O[1],O[2],c)}
        ${h?da(y,v,c,void 0,!l,w):ma(y,v,c,void 0,!l,w,!1,void 0,s)}`}}}}),xa,Sa,Ca,wa,Ta,Ea,Da,Oa,ka=l(()=>{R(),Pt(),U(),Z(),ra(),oa(),xa=e=>{let t=1;for(let n=0;n<e.length;n++)t*=e[n];return t},Sa=e=>typeof e==`number`?[e,e,e]:e,Ca=(e,t)=>t<=1?e:e+(e-1)*(t-1),wa=(e,t,n,r=1)=>{let i=Ca(t,r);return Math.floor((e[0]*(n-1)-n+i)/2)},Ta=(e,t,n,r,i)=>{i??=wa(e,t[0],r[0]);let a=[0,0,0,n];for(let n=0;n<3;n++)e[n]+2*i>=t[n]&&(a[n]=Math.trunc((e[n]-t[n]+2*i)/r[n]+1));return a},Ea=(e,t,n,r,i,a,o,s,c,l)=>{let u,d,f,p;if(e===`VALID`&&(e=0),typeof e==`number`){u={top:e,bottom:e,left:e,right:e,front:e,back:e};let m=Ta([t,n,r,1],[s,c,l],1,[i,a,o],e);d=m[0],f=m[1],p=m[2]}else if(Array.isArray(e)){if(!e.every((e,t,n)=>e===n[0]))throw Error(`Unsupported padding parameter: ${e}`);u={top:e[0],bottom:e[1],left:e[2],right:e[3],front:e[4],back:e[5]};let m=Ta([t,n,r,1],[s,c,l],1,[i,a,o],e[0]);d=m[0],f=m[1],p=m[2]}else if(e===`SAME_UPPER`){d=Math.ceil(t/i),f=Math.ceil(n/a),p=Math.ceil(r/o);let e=(d-1)*i+s-t,m=(f-1)*a+c-n,h=(p-1)*o+l-r,g=Math.floor(e/2),_=e-g,v=Math.floor(m/2),y=m-v,b=Math.floor(h/2);u={top:v,bottom:y,left:b,right:h-b,front:g,back:_}}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:u,outDepth:d,outHeight:f,outWidth:p}},Da=(e,t,n,r,i,a=!1,o=`channelsLast`)=>{let s,c,l,u,d;if(o===`channelsLast`)[s,c,l,u,d]=e;else if(o===`channelsFirst`)[s,d,c,l,u]=e;else throw Error(`Unknown dataFormat ${o}`);let[f,,p,m,h]=t,[g,_,v]=Sa(n),[y,b,x]=Sa(r),S=Ca(p,y),C=Ca(m,b),w=Ca(h,x),{padInfo:T,outDepth:E,outHeight:D,outWidth:O}=Ea(i,c,l,u,g,_,v,S,C,w),k=a?f*d:f,ee=[0,0,0,0,0];return o===`channelsFirst`?ee=[s,k,E,D,O]:o===`channelsLast`&&(ee=[s,E,D,O,k]),{batchSize:s,dataFormat:o,inDepth:c,inHeight:l,inWidth:u,inChannels:d,outDepth:E,outHeight:D,outWidth:O,outChannels:k,padInfo:T,strideDepth:g,strideHeight:_,strideWidth:v,filterDepth:p,filterHeight:m,filterWidth:h,effectiveFilterDepth:S,effectiveFilterHeight:C,effectiveFilterWidth:w,dilationDepth:y,dilationHeight:b,dilationWidth:x,inShape:e,outShape:ee,filterShape:t}},Oa=(e,t,n,r,i,a)=>{let o=a===`channelsLast`;o?e[0].dims[3]:e[0].dims[1];let s=[64,1,1],c={x:n.map((e,t)=>t)},l=[Math.ceil(xa(c.x.map(e=>n[e]))/s[0]),1,1];z(`verbose`,()=>`[conv3d_naive_webgpu] dispatch = ${l}`);let u=[{type:12,data:H.size(n)},{type:12,data:r},{type:12,data:i},{type:12,data:t.strides},{type:12,data:t.dilations}];ea(t,u),u.push(...K(e[0].dims,e[1].dims));let d=[`rank`,`rank`],f=e.length===3;return f&&(u.push(...K(e[2].dims)),d.push(`rank`)),u.push(...K(n)),{name:`Conv3DNaive`,shaderCache:{hint:`${t.cacheKey};${o};1;${f}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:l[0],y:l[1],z:l[2]},programUniforms:u}),getShaderSource:a=>{let s=[{name:`output_size`,type:`u32`},{name:`filter_dims`,type:`u32`,length:r.length},{name:`pads`,type:`u32`,length:i.length},{name:`strides`,type:`u32`,length:t.strides.length},{name:`dilations`,type:`u32`,length:t.dilations.length}];ta(t,s);let c=W(e[0].dataType),l=Y(`x`,e[0].dataType,e[0].dims.length,1),u=Y(`W`,e[1].dataType,e[1].dims.length,1),d=[l,u],p=X(`result`,e[0].dataType,n.length,1),m=``;if(f){let t=Y(`bias`,e[2].dataType,e[2].dims.length,1);d.push(t),m+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${c} {
          return bias[${o?J(`coords`,4,5):J(`coords`,1,5)}];
        }`}let h=ia(1,c),g=$i(t,h,c);return`
            ${m}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${l.getByIndices(`aIndices`)};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${u.getByIndices(`aIndices`)};
            }
          ${a.registerUniforms(s).declareVariables(...d,p)}
          ${a.mainStart()}
          ${a.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
              let coords = ${p.offsetToIndices(`global_idx`)};
              let batch = ${J(`coords`,0,l.rank)};
              let d2 = ${o?J(`coords`,l.rank-1,l.rank):J(`coords`,1,l.rank)};
              let xFRCCorner = vec3<u32>(${o?J(`coords`,1,l.rank):J(`coords`,2,l.rank)},
              ${o?J(`coords`,2,l.rank):J(`coords`,3,l.rank)},
              ${o?J(`coords`,3,l.rank):J(`coords`,4,l.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${o?J(`uniforms.x_shape`,1,l.rank):J(`uniforms.x_shape`,2,l.rank)};
              let xShapeZ = ${o?J(`uniforms.x_shape`,2,l.rank):J(`uniforms.x_shape`,3,l.rank)};
              let xShapeW = ${o?J(`uniforms.x_shape`,3,l.rank):J(`uniforms.x_shape`,4,l.rank)};
              let xShapeU = ${o?J(`uniforms.x_shape`,4,l.rank):J(`uniforms.x_shape`,1,l.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${o?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${o?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${o?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${o?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${f?`value = value + getBiasByOutputCoords(coords)`:``};
              ${g}
              result[global_idx] = f32(value);
          }`}}}}),Aa,ja,Ma=l(()=>{R(),U(),Z(),ra(),Aa=(e,t,n,r)=>{let i=e.length>2,a=i?`value += b[output_channel];`:``,o=e[0].dims,s=e[1].dims,c=t.format===`NHWC`,l=c?n[3]:n[1],u=l/t.group,d=c&&u>=4?q(l):1,f=H.size(n)/d,p=[{type:12,data:f},{type:12,data:t.dilations},{type:12,data:[t.strides[0],t.strides[1]]},{type:12,data:[t.pads[0],t.pads[1]]},{type:12,data:u}];ea(t,p),p.push(...K(o,[s[0],s[1],s[2],s[3]/d]));let m=i?[`rank`,`rank`,`rank`]:[`rank`,`rank`];return p.push(...K([n[0],n[1],n[2],n[3]/d])),{name:`GroupedConv`,shaderCache:{hint:`${t.cacheKey}_${d}`,inputDependencies:m},getRunData:()=>({outputs:[{dims:r?r(n):n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:p}),getShaderSource:r=>{let l=X(`output`,e[0].dataType,n.length,d),u=W(l.type.tensor),f=$i(t,l.type.value,u),p=Y(`x`,e[0].dataType,o.length),m=Y(`w`,e[1].dataType,s.length,d),h=[p,m];i&&h.push(Y(`b`,e[2].dataType,e[2].dims,d));let g=[{name:`output_size`,type:`u32`},{name:`dilations`,type:`u32`,length:t.dilations.length},{name:`strides`,type:`u32`,length:2},{name:`pads`,type:`u32`,length:2},{name:`output_channels_per_group`,type:`u32`}];ta(t,g);let _=c?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${p.get(`batch`,`xHeight`,`xWidth`,`input_channel`)};
            let wVal = ${m.get(`wHeight`,`wWidth`,`wInChannel`,`output_channel`)};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${p.get(`batch`,`input_channel`,`xHeight`,`xWidth`)};
            let wVal = ${m.get(`output_channel`,`wInChannel`,`wHeight`,`wWidth`)};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${r.registerUniforms(g).declareVariables(...h,l)}

  ${r.mainStart()}
    ${r.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}

    let outputIndices = ${l.offsetToIndices(`global_idx`)};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${c?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${c?1:2}], outputIndices[${c?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${d} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${c?2:1}];

    var value: ${l.type.value} = ${l.type.value}(0);
    ${_}
    ${a}
    ${f}
    ${l.setByOffset(`global_idx`,`value`)}
  }`}}},ja=(e,t,n,r)=>{let i=e.length>2,a=q(n[3]),o=q(n[2]),s=H.size(n)/a/o,c=[e[0].dims[0],e[0].dims[1],e[0].dims[2],e[0].dims[3]/a],l=[e[1].dims[0],e[1].dims[1],e[1].dims[2],e[1].dims[3]/a],u=[n[0],n[1],n[2],n[3]/a],d=[{type:12,data:s},{type:6,data:[t.strides[0],t.strides[1]]},{type:6,data:[t.pads[0],t.pads[1]]}];ea(t,d),d.push(...K(c,l,u));let f=(o-1)*t.strides[1]+l[1];return{name:`GroupedConv-Vectorize`,shaderCache:{hint:`${t.cacheKey};${a};${o};${f};${l[0]};${l[1]}`,inputDependencies:i?[`rank`,`rank`,`type`]:[`rank`,`rank`]},getRunData:()=>({outputs:[{dims:r?r(n):n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:d}),getShaderSource:n=>{let r=X(`output`,e[0].dataType,u.length,a),s=W(r.type.tensor),d=$i(t,r.type.value,s),p=Y(`x`,e[0].dataType,c.length,a),m=Y(`w`,e[1].dataType,l.length,a),h=[p,m];i&&h.push(Y(`b`,e[2].dataType,e[2].dims,a));let g=i?`value += b[output_channel];`:``,_=[{name:`output_size`,type:`u32`},{name:`strides`,type:`i32`,length:2},{name:`pads`,type:`i32`,length:2}];return ta(t,_),`
  ${n.registerUniforms(_).declareVariables(...h,r)}
  ${n.mainStart()}
    ${n.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${o}u;
    let col = (index1 % width1) * ${o}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${p.type.value}, ${f}>;
    var values: array<${r.type.value}, ${o}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${l[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${f}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${p.get(`batch`,`u32(x_height)`,`u32(x_width)`,`input_channel`)};
          } else {
            x_vals[i] = ${p.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${l[1]}; w_width++) {
          let w_val = ${m.get(`w_height`,`w_width`,`0`,`output_channel`)};
          for (var i = 0u; i < ${o}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${o}u; i++) {
      var value = values[i];
      ${g}
      ${d}
      ${r.set(`batch`,`row`,`col + i`,`output_channel`,`value`)};
    }
  }`}}}}),Na,Pa,Fa,Ia=l(()=>{R(),U(),_a(),Z(),ra(),Na=(e,t,n,r,i=!1,a)=>{let o=e[0].dims,s=e[1].dims,c=o[o.length-2],l=s[s.length-1],u=o[o.length-1],d=q(l),f=q(u),p=q(c),m=H.size(n)/d/p,h=e.length>2,g=r?r.slice(0,-2):n.slice(0,-2),_=[H.size(g),c,l],v=[{type:12,data:m},{type:12,data:c},{type:12,data:l},{type:12,data:u}];return ea(t,v),v.push(...K(g,o,s)),h&&v.push(...K(e[2].dims)),v.push(...K(_)),{name:`MatMulNaive`,shaderCache:{hint:`${t.activation};${d};${f};${p};${i}`,inputDependencies:h?[`rank`,`rank`,`rank`]:[`rank`,`rank`]},getRunData:()=>({outputs:[{dims:a?a(n):n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(m/64)},programUniforms:v}),getShaderSource:r=>{let a=cn(`batch_dims`,e[0].dataType,g.length),c=Y(`a`,e[0].dataType,o.length,f),l=Y(`b`,e[1].dataType,s.length,d),u=X(`output`,e[0].dataType,_.length,d),m=W(u.type.tensor),v=$i(t,u.type.value,m),y=[c,l],b=``;if(h){let t=i?d:1;y.push(Y(`bias`,e[2].dataType,e[2].dims.length,t)),b=`${i?`value += bias[col / ${t}];`:`value += ${u.type.value}(bias[row + i]);`}`}let x=o.slice(0,-2),S=s.slice(0,-2),C=dn(x,g),w=dn(S,g),T=[{name:`output_size`,type:`u32`},{name:`M`,type:`u32`},{name:`N`,type:`u32`},{name:`K`,type:`u32`}];ta(t,T);let E=(e,t)=>{let n=e.rank,r=e.name;if(n===2)return`var ${r}_indices = ${e.type.indices}(0u, 0u);`;let i=a.rank,o=`var ${r}_indices: ${e.type.indices};`;for(let e=n-2-1,t=i-1;e>=0;e--,t--)o+=`
${r}_indices[${e}] = ${i>1?`batch_indices[${t}]`:`batch_indices`};`;return t.forEach(e=>{o+=`
${r}_indices[${e}] = 0;`}),o+=`${r}_indices[${n-2}] = 0u;
                     ${r}_indices[${n-1}] = 0u;`,o},D=()=>{let e=`var a_data: ${c.type.value};`;for(let t=0;t<f;t++)e+=`
              let b_data${t} = b[(b_offset + (k + ${t}) * uniforms.N + col) / ${d}];`;for(let t=0;t<p;t++){e+=`a_data = a[(a_offset + (row + ${t}) * uniforms.K + k) / ${f}];`;for(let n=0;n<f;n++)e+=`
            values[${t}] = fma(${l.type.value}(a_data${f===1?``:`[${n}]`}), b_data${n}, values[${t}]);
`}return e};return`
  ${r.registerUniforms(T).registerInternalVariables(a).declareVariables(...y,u)}
  ${r.mainStart()}
    ${r.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
    let col = (global_idx % (uniforms.N / ${d})) * ${d};
    var index1 = global_idx / (uniforms.N / ${d});
    let stride1 = uniforms.M / ${p};
    let row = (index1 % stride1) * ${p};
    let batch = index1 / stride1;

    ${n.length===2?``:`let batch_indices = ${a.offsetToIndices(`batch`)};`}
    ${E(c,C)}
    let a_offset = ${c.indicesToOffset(`a_indices`)};
    ${E(l,w)}
    let b_offset = ${l.indicesToOffset(`b_indices`)};
    var values: array<${u.type.value}, ${p}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${f}) {
      ${D()}
    }
    for (var i = 0u; i < ${p}u; i++) {
      var value = values[i];
      ${b}
      ${v}
      let cur_indices = ${u.type.indices}(batch, row + i, col);
      let offset = ${u.indicesToOffset(`cur_indices`)};
      ${u.setByOffset(`offset / ${d}`,`value`)};
    }
  }
  `}}},Pa=e=>{if(!e||e.length!==2)throw Error(`MatMul requires 2 inputs.`);if(e[0].dims[e[0].dims.length-1]!==e[1].dims[e[1].dims.length-2])throw Error(`shared dimension does not match.`)},Fa=e=>{Pa(e.inputs);let t=Xt.calcShape(e.inputs[0].dims,e.inputs[1].dims,!0);if(!t)throw Error(`Can't use matmul on the given tensors`);let n=t[t.length-1],r=e.inputs[0].dims[e.inputs[0].dims.length-1];n<8&&r<8?e.compute(Na(e.inputs,{activation:``},t)):e.compute(ga(e.inputs,{activation:``},t))}}),La,Ra,za,Ba,Va,Ha,Ua,Wa,Ga,Ka=l(()=>{U(),ba(),ka(),_a(),Ma(),ra(),Ia(),bn(),La=(e,t,n,r,i,a)=>{let o=e[0],s=e.slice(a?1:2,a?3:4),c=s.length,l=t[0],u=t.slice(2).map((e,t)=>e+(e-1)*(n[t]-1)),d=s.map((e,t)=>e+r[t]+r[t+c]).map((e,t)=>Math.floor((e-u[t]+i[t])/i[t]));return d.splice(0,0,o),d.splice(a?3:1,0,l),d},Ra=[2,3,1,0],za=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw Error(`Conv requires 2 or 3 inputs`);if(e[0].dims.length>5)throw Error(`greater than 5D is not supported`);if(e[0].dims.length!==e[1].dims.length)throw Error(`filter does not have same dimension as input`);if(e[0].dims[t.format===`NHWC`?e[0].dims.length-1:1]!==e[1].dims[1]*t.group)throw Error(`FILTER_IN_CHANNEL should be equal to DATA_CHANNEL`);if(e.length===3&&(e[2].dims.length!==1||e[1].dims[0]!==e[2].dims[0]))throw Error(`invalid bias`);let n=e[0].dims.length-2;if(t.dilations.length!==n)throw Error(`dilations should be ${n}D`);if(t.strides.length!==n)throw Error(`strides should be ${n}D`);if(t.pads.length!==n*2)throw Error(`pads should be ${n*2}D`);if(t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw Error(`invalid kernel shape`)},Ba=(e,t)=>{let n=e.kernelShape.slice();n.length<t[1].dims.length-2&&n.push(...Array(t[1].dims.length-2-n.length).fill(0));for(let e=2;e<t[1].dims.length;++e)n[e-2]===0&&(n[e-2]=t[1].dims[e]);let r=e.pads.slice();Zt.adjustPadsBasedOnAutoPad(t[0].dims,e.strides,e.dilations,n,r,e.format===`NHWC`,e.autoPad);let i=Object.assign({},e);return Object.assign(i,{kernelShape:n,pads:r}),i},Va=e=>{let t=na(e),n=e.format;return{autoPad:[`NOTSET`,`VALID`,`SAME_UPPER`,`SAME_LOWER`][e.auto_pad],format:n,dilations:e.dilations,group:e.group,kernelShape:e.kernel_shape,pads:e.pads,strides:e.strides,wIsConst:e.w_is_const(),...t,cacheKey:`${e.format};${t.activation};`}},Ha=(e,t,n,r)=>{let i=n.format===`NHWC`,a=La(t[0].dims,t[1].dims,n.dilations,n.pads,n.strides,i);if(n.group!==1){let o=[t[0]];if(i){let r=e.kernelCustomData.wT??e.compute(_n(t[1],Ra),{inputs:[1],outputs:[n.wIsConst?-2:-1]})[0];n.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=r),o.push(r)}else o.push(t[1]);t.length===3&&o.push(t[2]),!e.adapterInfo.isArchitecture(`ampere`)&&i&&t[1].dims[0]===n.group&&t[1].dims[1]===1&&n.dilations[0]===1&&n.dilations[1]===1?e.compute(ja(o,n,a,r),{inputs:o}):e.compute(Aa(o,n,a,r),{inputs:o});return}let o=t.length===3,s=t[0].dims[i?1:2],c=t[0].dims[i?2:3],l=t[0].dims[i?3:1],u=t[1].dims[2],d=t[1].dims[3],f=a[i?1:2],p=a[i?2:3],m=a[i?3:1],h=i&&u===s&&d===c&&n.pads[0]===0&&n.pads[1]===0;if(h||u===1&&d===1&&n.dilations[0]===1&&n.dilations[1]===1&&n.strides[0]===1&&n.strides[1]===1&&n.pads[0]===0&&n.pads[1]===0){let u=a[0],d,g,_,v=[];if(i){let r=e.kernelCustomData.wT??e.compute(_n(t[1],Ra),{inputs:[1],outputs:[n.wIsConst?-2:-1]})[0];if(n.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=r),h){let e=s*c*l;d=t[0].reshape([1,u,e]),g=r.reshape([1,e,m]),_=[1,u,m]}else d=t[0].reshape([u,s*c,l]),g=r.reshape([1,l,m]),_=[u,f*p,m];v.push(d),v.push(g)}else d=t[0].reshape([u,l,s*c]),g=t[1].reshape([1,m,l]),_=[u,m,f*p],v.push(g),v.push(d);o&&v.push(t[2]);let y=_[2],b=v[0].dims[v[0].dims.length-1];y<8&&b<8?e.compute(Na(v,n,a,_,i,r),{inputs:v}):e.compute(ga(v,n,a,_,i,r),{inputs:v});return}let g=e.kernelCustomData.wT??e.compute(_n(t[1],Ra),{inputs:[1],outputs:[n.wIsConst?-2:-1]})[0];n.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=g);let _=[t[0],g];o&&_.push(t[2]);let v=i?f*p:m,y=i?m:f*p,b=u*d*l;e.compute(ya(_,n,a,v,y,b,o,!0,r),{inputs:_})},Ua=(e,t)=>{let n=t.format===`NHWC`,r=[e.inputs[0].reshape(n?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&r.push(e.inputs[2]);let i=[0,t.pads[0],0,t.pads[1]],a=[1].concat(t.strides),o=[1].concat(t.dilations),s=[1].concat(t.kernelShape),c=Ba({...t,pads:i,strides:a,dilations:o,kernelShape:s},r);Ha(e,r,c,e=>n?[e[0],e[2],e[3]]:[e[0],e[1],e[3]])},Wa=(e,t,n)=>{let r=n.format===`NHWC`?`channelsLast`:`channelsFirst`,i=Ba(n,t),a=n.autoPad===`NOTSET`?n.pads:n.autoPad,o=Da(t[0].dims,t[1].dims,n.strides,n.dilations,a,!1,r);e.compute(Oa(t,i,o.outShape,[o.filterDepth,o.filterHeight,o.filterWidth],[o.padInfo.front,o.padInfo.top,o.padInfo.left],r))},Ga=(e,t)=>{if(za(e.inputs,t),e.inputs[0].dims.length===3)Ua(e,t);else if(e.inputs[0].dims.length===5)Wa(e,e.inputs,t);else{let n=Ba(t,e.inputs);Ha(e,e.inputs,n)}}}),qa,Ja,Ya=l(()=>{R(),Pt(),Z(),ra(),oa(),ca(),_a(),qa=(e,t=!1,n,r,i=4)=>{let a=e=>{switch(e){case 1:return`return w[getIndexFromCoords4D(coord, vec4<i32>(uniforms.w_shape))];`;case 4:return`
            let coord1 = vec4<i32>(coordX, coordY, col + 1, rowInner);
            let coord2 = vec4<i32>(coordX, coordY, col + 2, rowInner);
            let coord3 = vec4<i32>(coordX, coordY, col + 3, rowInner);
            let v0 = w[getIndexFromCoords4D(coord, vec4<i32>(uniforms.w_shape))];
            let v1 = w[getIndexFromCoords4D(coord1, vec4<i32>(uniforms.w_shape))];
            let v2 = w[getIndexFromCoords4D(coord2, vec4<i32>(uniforms.w_shape))];
            let v3 = w[getIndexFromCoords4D(coord3, vec4<i32>(uniforms.w_shape))];
            return ${r}(v0, v1, v2, v3);
            `;default:throw Error(`innerElementSize ${e} is not supported.`)}},o=e?`
      let coord = vec4<i32>(batch, iXR, iXC, xCh);
      `:`
      let coord = vec4<i32>(batch, xCh, iXR, iXC);
      `,s=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,c=e?`i32(uniforms.x_shape[1])`:`i32(uniforms.x_shape[2])`,l=e?`i32(uniforms.x_shape[2])`:`i32(uniforms.x_shape[3])`,u=e?`row`:`col`,d=e?`col`:`row`,f=`
      let inChannels = ${e?`i32(uniforms.x_shape[3])`:`i32(uniforms.x_shape[1])`};
      let outWidth = ${e?`i32(uniforms.result_shape[2])`:`i32(uniforms.result_shape[3])`};
      let outRow = ${u} / outWidth;
      let outCol = ${u} % outWidth;

      let WRow = ${d} / (uniforms.filter_dims[1] * inChannels);
      let WCol = ${d} / inChannels % uniforms.filter_dims[1];
      let xR = f32(outRow - uniforms.pads[0] + uniforms.dilations[0] * WRow) / f32(uniforms.strides[0]);
      let xC = f32(outCol - uniforms.pads[1] + uniforms.dilations[1] * WCol) / f32(uniforms.strides[1]);
      if (xR < 0.0 || xR >= f32(${c}) || fract(xR) > 0.0) {
        return ${r}(0.0);
      }
      if (xC < 0.0 || xC >= f32(${l}) || fract(xC) > 0.0) {
        return ${r}(0.0);
      }
      let iXR = i32(xR);
      let iXC = i32(xC);
      let xCh = ${d} % inChannels;
      ${o}
      return x[getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape))/${i}];`,p=e?`
      let col = colIn * ${i};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
        ${f}
      }
      return ${r}(0.0);`:`
      let col = colIn * ${i};
      if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
        ${f}
      }
      return ${r}(0.0);`,m=`
      let col = colIn * ${i};
      let inChannels = ${e?`i32(uniforms.x_shape[3])`:`i32(uniforms.x_shape[1])`};
      let coordX = uniforms.filter_dims[0] - 1 - row / (uniforms.filter_dims[1] * inChannels);
      let coordY = uniforms.filter_dims[1] - 1 - (row / inChannels) % uniforms.filter_dims[1];
      if (${e?`row < uniforms.dim_inner && col < uniforms.dim_b_outer`:`row < uniforms.dim_inner && col < uniforms.dim_a_outer`}  && coordX >= 0 && coordY >= 0) {
        let rowInner = row % inChannels;
        let coord = vec4<i32>(coordX, coordY, col, rowInner);
        ${a(i)}
      }
      return ${r}(0.0);
      `,h=$i(n,r);return`
  fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${r} {
    ${e?p:m}
  }

  fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${r} {
    ${e?m:p}
  }

  fn mm_write(batch: i32, row : i32, colIn : i32, valueInput : ${r}) {
    let col = colIn * ${i};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
      var value = valueInput;
      let outWidth = ${e?`i32(uniforms.result_shape[2])`:`i32(uniforms.result_shape[3])`};
      ${s}
      ${aa(t)}
      ${h}
      result[getIndexFromCoords4D(coords, vec4<i32>(uniforms.result_shape))/${i}] = value;
    }
  }`},Ja=(e,t,n,r,i,a,o,s)=>{let c=t.format===`NHWC`,l=c?e[0].dims[3]:e[0].dims[1],u=n[0],d=c?n[2]:n[3],f=c?n[1]:n[2],p=c?n[3]:n[1],m=c&&l%4==0&&l%3&&p%4==0,h=c?p:d*f,g=c?d*f:p,_=[8,8,1],v=r<=8?[4,1,1]:[4,4,1],y=[Math.ceil(h/_[0]/v[0]),Math.ceil(g/_[1]/v[1]),Math.ceil(u/_[2]/v[2])];z(`verbose`,()=>`[conv_backprop_mm_webgpu] dispatch = ${y}`);let b=m?4:1,x=Math.max(_[0]*b,_[1]),S=m?4:1,C=[t.kernelShape[c?1:2],t.kernelShape[c?2:3]],w=[C[0]+(t.dilations[0]<=1?0:(C[0]-1)*(t.dilations[0]-1)),C[1]+(t.dilations[1]<=1?0:(C[1]-1)*(t.dilations[1]-1))],T=[w[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),w[1]-1-Math.floor((t.pads[1]+t.pads[3])/2)],E=[{type:6,data:r},{type:6,data:i},{type:6,data:a},{type:6,data:t.strides},{type:6,data:t.dilations},{type:6,data:C},{type:6,data:T}];ea(t,E),E.push(...K(e[0].dims,e[1].dims));let D=[`rank`,`rank`];return o&&(E.push(...K(e[2].dims)),D.push(`rank`)),E.push(...K(n)),{name:`Conv2DTransposeMatMul`,shaderCache:{hint:`${t.cacheKey};${v};${_};${m}`,inputDependencies:D},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:y[0],y:y[1],z:y[2]},programUniforms:E}),getShaderSource:r=>{let i=Y(`x`,e[0].dataType,e[0].dims.length,S),a=Y(`w`,e[1].dataType,e[1].dims.length,1),l=X(`result`,e[0].dataType,n.length,S),u=[i,a],d=``;if(o){let t=Y(`bias`,e[2].dataType,e[2].dims.length,S);u.push(t),d+=`
          fn getBiasByOutputCoords(coords : vec4<i32>) -> ${t.type.value} {
            return bias[coords.${c?`w`:`y`}${m?`/ 4`:``}];
          }`}let f=[{name:`dim_a_outer`,type:`i32`},{name:`dim_b_outer`,type:`i32`},{name:`dim_inner`,type:`i32`},{name:`strides`,type:`i32`,length:2},{name:`dilations`,type:`i32`,length:2},{name:`filter_dims`,type:`i32`,length:C.length},{name:`pads`,type:`i32`,length:T.length}];ta(t,f);let p=W(e[0].dataType,1);if(p!==`f16`&&p!==`f32`)throw Error(`elemType ${p} is not supported.`);return`
        ${sa(`uniforms.result_strides`)}
        ${r.registerUniforms(f).declareVariables(...u,l)};
        ${d}
        ${qa(c,o,t,i.type.value,b)}
        ${m?da(v,_,p,void 0,!c,x):ma(v,_,p,void 0,!c,x,!1,void 0,s)}`}}}}),Xa,Za,Qa=l(()=>{R(),Pt(),U(),Z(),Xa=(e,t,n,r,i,a=!1,o,s,c=!1)=>{let l=c?1:2,u=c?2:3,d=c?3:1,f=a?2:1,p=`
  fn setOutputAtIndex(flatIndex : u32, value : ${a?`vec4<${o}>`:o}) {
    result[flatIndex] = ${a?`vec4<${o}>`:o}(value);
  }`;r&&(p+=`
    fn getBiasByOutputCoords(coords : vec4<u32>) -> ${a?`vec4<${o}>`:o} {
      return bias[coords.${c?`w`:`y`}${a?`/ 4`:``}];
    }`);let m=a?4:1,h=Y(`W`,t[1].dataType,t[1].dims.length,m),g=Y(`Dy`,t[0].dataType,t[0].dims.length,m),_=[g,h];r&&_.push(Y(`bias`,t[2].dataType,[n[d]].length,m));let v=X(`result`,t[0].dataType,n.length,m),y=`{
        let batch: u32 = ${i?`global_id.z`:`workgroup_id.z`} / uniforms.result_shape[1];
        let r = ${i?`global_id.z`:`workgroup_id.z`} % uniforms.result_shape[1];
        let c = ${i?`global_id.y`:`workgroup_id.y`} * ${f};
        let d1: u32 = ${i?`global_id.x`:`workgroup_id.x`} * 4;

        let dyCorner = vec2<i32>(i32(r), i32(c)) - vec2<i32>(uniforms.pads);

        // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
        // ? = to be determined. : = across all values in that axis.
        var dotProd: array<vec4<${o}>, ${f}>;
        for (var i = 0; i < ${f}; i++) {
          dotProd[i] = vec4<${o}>(0.0);
        }
        for (var wR: u32 = 0; wR < uniforms.filter_dims[0]; wR = wR + 1) {
          var dyR = (${o}(dyCorner.x) + ${o}(wR)) / ${o}(uniforms.strides.x);
          let wRPerm = uniforms.filter_dims[0] - 1 - wR;
          if (dyR < 0.0 || dyR >= ${o}(uniforms.Dy_shape[1]) ||
              fract(dyR) > 0.0 || wRPerm < 0) {
            continue;
          }
          let idyR: u32 = u32(dyR);

          for (var wC: u32 = 0; wC < uniforms.filter_dims[1]; wC = wC + 1) {
            let dyC = (${o}(dyCorner.y) + ${o}(wC)) / ${o}(uniforms.strides.y);
            let dyC2 = (${o}(dyCorner.y) + 1.0 + ${o}(wC)) / ${o}(uniforms.strides.y);
            let wCPerm = uniforms.filter_dims[1] - 1 - wC;
            if (wCPerm < 0) {
              continue;
            }
            var bDyCVal = true;
            var bDyCVal2 = true;
            if (dyC < 0.0 || dyC >= ${o}(uniforms.Dy_shape[2]) ||
                fract(dyC) > 0.0) {
              bDyCVal = false;
            }
            if (dyC2 < 0.0 || dyC2 >= ${o}(uniforms.Dy_shape[2]) ||
                fract(dyC2) > 0.0) {
              bDyCVal2 = false;
            }

            let idyC: u32 = u32(dyC);
            let idyC2: u32 = u32(dyC2);
            if (bDyCVal && bDyCVal2) {
              let d2Length = uniforms.Dy_shape[3];
              for (var d2 :u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1`,`d2`)};
                let wValue1 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 1`,`d2`)};
                let wValue2 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 2`,`d2`)};
                let wValue3 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 3`,`d2`)};

                var xValue = ${g.get(`batch`,`idyR`,`idyC`,`d2`)};
                let tmpval = vec4<${o}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[0] = dotProd[0] + tmpval;

                xValue =  ${g.get(`batch`,`idyR`,`idyC2`,`d2`)};

                dotProd[1] = dotProd[1] + vec4<${o}>(dot(xValue, wValue0),
                                                    dot(xValue, wValue1),
                                                    dot(xValue, wValue2),
                                                    dot(xValue, wValue3));
              }
            } else if (bDyCVal) {
              let d2Length = uniforms.Dy_shape[${d}];
              for (var d2: u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1`,`d2`)};
                let wValue1 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 1`,`d2`)};
                let wValue2 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 2`,`d2`)};
                let wValue3 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 3`,`d2`)};

                var xValue = ${g.get(`batch`,`idyR`,`idyC`,`d2`)};
                let tmpval = vec4<${o}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[0] = dotProd[0] + tmpval;
              }
            } else if (bDyCVal2) {
              let d2Length = uniforms.Dy_shape[3];
              for (var d2: u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1`,`d2`)};
                let wValue1 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 1`,`d2`)};
                let wValue2 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 2`,`d2`)};
                let wValue3 = ${h.get(`u32(wRPerm)`,`u32(wCPerm)`,`d1 + 3`,`d2`)};

                var xValue = ${g.get(`batch`,`idyR`,`idyC2`,`d2`)};
                let tmpval = vec4<${o}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[1] = dotProd[1] + tmpval;
              }
            }
          }
        }

        for (var i: u32 = 0; i < ${f}; i = i + 1) {
          let value = dotProd[i] + ${r?`bias[c+i]`:`vec4<${o}>(0.0)`};
          ${v.set(`batch`,`r`,`c + i`,`d1`,`value`)};
        }
      }`,b=`
          let outputIndices = ${v.offsetToIndices(`global_idx`)};
          let batch = ${v.indicesGet(`outputIndices`,0)};
          let d1 = ${v.indicesGet(`outputIndices`,d)};
          let r = ${v.indicesGet(`outputIndices`,l)};
          let c = ${v.indicesGet(`outputIndices`,u)};
          let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
          let dyRCorner = dyCorner.x;
          let dyCCorner = dyCorner.y;
          let groupId = d1 / uniforms.output_channels_per_group;
          let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
          // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
          // ? = to be determined. : = across all values in that axis.
          var dotProd = ${o}(0.0);
          for (var wR: u32 = 0; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
            if (wR % uniforms.dilations.x != 0) {
              continue;
            }
            let dyR = (${o}(dyRCorner) + ${o}(wR)) / ${o}(uniforms.strides[0]);
            let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
            if (dyR < 0.0 || dyR >= ${o}(uniforms.Dy_shape[${l}]) || fract(dyR) > 0.0 ||
                wRPerm < 0) {
              continue;
            }
            let idyR: u32 = u32(dyR);

            for (var wC: u32 = 0; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
              if (wC % uniforms.dilations.y != 0) {
                continue;
              }
              let dyC = (${o}(dyCCorner) + ${o}(wC)) / ${o}(uniforms.strides.y);
              let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
              if (dyC < 0.0 || dyC >= ${o}(uniforms.Dy_shape[${u}]) ||
                  fract(dyC) > 0.0 || wCPerm < 0) {
                continue;
              }
              let idyC: u32 = u32(dyC);
              var inputChannel = groupId * uniforms.input_channels_per_group;
              for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group; d2 = d2 + 1) {
                let xValue = ${c?g.get(`batch`,`idyR`,`idyC`,`inputChannel`):g.get(`batch`,`inputChannel`,`idyR`,`idyC`)};
                let wValue = ${h.get(`inputChannel`,`wOutChannel`,`u32(wRPerm)`,`u32(wCPerm)`)};
                dotProd = dotProd + xValue * wValue;
                inputChannel = inputChannel + 1;
              }
            }
          }
          let value = dotProd + ${r?`bias[d1]`:`${o}(0.0)`};
          ${v.setByOffset(`global_idx`,`value`)};
        `;return`
  ${e.registerUniforms(s).declareVariables(..._,v)}
  ${p}

    ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)};
  ${a?y:b}}`},Za=(e,t,n)=>{let r=e.length>2,i=t.outputShape,a=H.size(i),o=[Math.ceil(a/64),1,1];z(`verbose`,()=>`[conv2d_backprop_webgpu] dispatch = ${o}`);let s=t.format===`NHWC`,c=[`rank`,`rank`],l=[t.strides[0],t.strides[1]],u=[t.kernelShape[s?1:2],t.kernelShape[s?2:3]],d=[t.dilations[0],t.dilations[1]],f=[u[0]+(t.dilations[0]<=1?0:(t.kernelShape[s?1:2]-1)*(t.dilations[0]-1)),u[1]+(t.dilations[1]<=1?0:(t.kernelShape[s?2:3]-1)*(t.dilations[1]-1))],p=[f[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),f[1]-1-Math.floor(t.pads[1]+t.pads[3])/2],m=t.group,h=e[1].dims,g=h[0]/m,_=h[1],v=[{type:12,data:a},{type:12,data:l},{type:12,data:u},{type:12,data:d},{type:12,data:f},{type:6,data:p},{type:12,data:g},{type:12,data:_},...K(e[0].dims,e[1].dims)];r&&(v.push(...K(e[2].dims)),c.push(`rank`)),v.push(...K(i));let y=o[1]===1&&o[2]===1;return{name:`ConvTranspose2D`,shaderCache:{hint:`${t.cacheKey};`,inputDependencies:c},getRunData:()=>({dispatchGroup:{x:o[0],y:o[1],z:o[2]},outputs:[{dims:n?n(i):i,dataType:e[0].dataType}],programUniforms:v}),getShaderSource:t=>{let n=[{name:`output_size`,type:`u32`},{name:`strides`,type:`u32`,length:l.length},{name:`filter_dims`,type:`u32`,length:u.length},{name:`dilations`,type:`u32`,length:u.length},{name:`effective_filter_dims`,type:`u32`,length:f.length},{name:`pads`,type:`i32`,length:p.length},{name:`input_channels_per_group`,type:`u32`},{name:`output_channels_per_group`,type:`u32`}],a=W(e[0].dataType);return`${Xa(t,e,i,r,y,!1,a,n,s)}`}}}}),$a,eo,to,no,ro,io,ao,oo,so,co,lo=l(()=>{Ya(),Qa(),ra(),bn(),$a=(e,t,n,r,i,a)=>(e-1)*t+n+(r-1)*i+1-a,eo=(e,t,n,r,i)=>{let a=Math.floor(e/2);t===`SAME_UPPER`?(n[r]=a,n[i]=e-a):t===`SAME_LOWER`&&(n[r]=e-a,n[i]=a)},to=(e,t,n,r,i,a,o,s,c,l)=>{let u=e.length-2,d=l.length===0;c.length<u&&c.push(...Array(u-c.length).fill(0));let f=e[0],p=t[s?3:1]*i;for(let i=0,f=e.length-u-+!!s;i<u;++i,++f){let s=e[f],p=d?s*o[i]:l[i],m=$a(s,o[i],a[i],t[f],n[i],p);eo(m,r,a,i,i+u),d&&l.push(o[i]*(s-1)+c[i]+(t[f]-1)*n[i]+1-a[i]-a[i+u])}l.splice(0,0,f),l.splice(s?3:1,0,p)},no=(e,t)=>{let n=e.kernelShape.slice();if(e.kernelShape.length===0||e.kernelShape.reduce((e,t)=>e*t,1)===0){n.length=0;for(let e=2;e<t[1].dims.length;++e)n.push(t[1].dims[e])}let r=e.format===`NHWC`;n.splice(0,0,t[1].dims[0]),n.splice(r?3:1,0,t[1].dims[1]);let i=e.pads.slice(),a=e.outputShape.slice(),o=e.outputPadding.slice(),s=t[0].dims,c=e.dilations.slice();if(c.reduce((e,t)=>e+t,0)===0){let e=t[0].dims.length-2;c=Array(e).fill(1)}let l=e.strides.slice();if(l.reduce((e,t)=>e+t,0)===0){let e=t[0].dims.length-2;l=Array(e).fill(1)}to(s,n,c,e.autoPad,e.group,i,l,r,o,a);let u=Object.assign({},e);return Object.assign(u,{kernelShape:n,pads:i,outputPadding:o,outputShape:a,dilations:c,strides:l}),u},ro=e=>{let t=na(e),n=e.format,r=[`NOTSET`,`VALID`,`SAME_UPPER`,`SAME_LOWER`][typeof e.autoPad>`u`?0:e.autoPad],i=e.dilations,a=e.group,o=e.kernelShape,s=e.pads,c=e.strides,l=e.wIsConst();return{autoPad:r,format:n,dilations:i,group:a,kernelShape:o,outputPadding:e.outputPadding,outputShape:e.outputShape,pads:s,strides:c,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},io=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw Error(`Conv requires 2 or 3 inputs`);if(e[0].dims.length!==4&&e[0].dims.length!==3)throw Error(`currently only support 2-dimensional conv`);if(e[0].dims.length!==e[1].dims.length)throw Error(`filter does not have same dimension as input`);if(e[0].dims[t.format===`NHWC`?e[0].dims.length-1:1]!==e[1].dims[0])throw Error(`FILTER_IN_CHANNEL should be equal to DATA_CHANNEL`);let n=e[1].dims[1]*t.group;if(e.length===3&&(e[2].dims.length!==1||e[2].dims[0]!==n))throw Error(`invalid bias`);let r=e[0].dims.length-2;if(t.dilations.reduce((e,t)=>e+t,0)>0&&t.dilations.length!==r)throw Error(`dilations should be ${r}D`);if(t.strides.reduce((e,t)=>e+t,0)>0&&t.strides.length!==r)throw Error(`strides should be ${r}D`);if(t.pads.reduce((e,t)=>e+t,0)>0&&t.pads.length!==r*2)throw Error(`pads should be ${r*2}D`);if(t.outputPadding.length!==r&&t.outputPadding.length!==0)throw Error(`output_padding should be ${r}D`);if(t.kernelShape.reduce((e,t)=>e+t,0)>0&&t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw Error(`invalid kernel shape`);if(t.outputShape.length!==0&&t.outputShape.length!==e[0].dims.length-2)throw Error(`invalid output shape`)},ao=[2,3,1,0],oo=(e,t,n)=>{let r=no(n,t),i=n.format===`NHWC`,a=r.outputShape,o=a[i?3:1],s=t[0].dims[i?3:1];if(r.group!==1||o===1&&s===1){e.compute(Za(t,r));return}let c=a[i?1:2],l=a[i?2:3],u=t[1].dims[2],d=t[1].dims[3],f=i?c*l:o,p=i?o:c*l,m=u*d*s,h=e.kernelCustomData.wT??e.compute(_n(t[1],ao),{inputs:[1],outputs:[n.wIsConst?-2:-1]})[0];n.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=h);let g=[t[0],h],_=t.length===3;_&&(!i&&t[2].dims.length===1?g.push(t[2].reshape([t[2].dims[0],1,1])):g.push(t[2])),e.compute(Ja(g,r,a,f,p,m,_,!0),{inputs:g})},so=(e,t)=>{let n=t.format===`NHWC`,r=[e.inputs[0].reshape(n?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&r.push(e.inputs[2]);let i=t.kernelShape;(i.length===0||i[0]===0)&&(i=[e.inputs[1].dims[2]]);let a=t.dilations;(a.length===0||a[0]===0)&&(a=[1]);let o=t.strides;(o.length===0||o[0]===0)&&(o=[1]);let s=t.pads;s.length===0&&(s=[0,0]),s=[0,s[0],0,s[1]],o=[1].concat(o),a=[1].concat(a),i=[1].concat(i);let c=no({...t,pads:s,strides:o,dilations:a,kernelShape:i},r);e.compute(Za(r,c,e=>n?[e[0],e[2],e[3]]:[e[0],e[1],e[3]]))},co=(e,t)=>{io(e.inputs,t),e.inputs[0].dims.length===3?so(e,t):oo(e,e.inputs,t)}}),uo,fo,po,mo=l(()=>{R(),U(),V(),Z(),uo=(e,t,n,r)=>{let i=H.size(t),a=t.length,o=Y(`input`,e,a),s=X(`output`,e,a),c=n.dataType===6?n.getInt32Array()[0]:Number(n.getBigInt64Array()[0]),l=H.normalizeAxis(c,a);return{name:`CumSum`,shaderCache:{hint:r.cacheKey,inputDependencies:[`rank`]},getRunData:()=>({outputs:[{dims:t,dataType:e}],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:[{type:12,data:i},{type:12,data:l},...K(t,t)]}),getShaderSource:e=>{let t=` i32(${o.indicesGet(`inputIndices`,`uniforms.axis`)}) `,n=J(`uniforms.input_shape`,`uniforms.axis`,a),i=r.reverse?t+(r.exclusive?` + 1`:``):`0`,c=r.reverse?n:t+(r.exclusive?``:` + 1`);return`
                ${e.registerUniform(`outputSize`,`u32`).registerUniform(`axis`,`u32`).declareVariables(o,s)}
                ${e.mainStart()}
                  ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
                  var inputIndices = ${s.offsetToIndices(`global_idx`)};
                  var sum = ${s.type.value}(0);
                  let first : i32 = ${i};
                  let last : i32 = ${c};
                  for (var i : i32 = first; i < last; i++) {
                    ${o.indicesSet(`inputIndices`,`uniforms.axis`,`u32(i)`)};
                    sum = sum + ${o.getByIndices(`inputIndices`)};
                  }
                  ${s.setByOffset(`global_idx`,`sum`)};
                }`}}},fo=(e,t)=>{let n=e.inputs[0].dims,r=e.inputs[0].dataType,i=e.inputs[1];e.compute(uo(r,n,i,t),{inputs:[0]})},po=e=>{let t=e.exclusive===1,n=e.reverse===1;return B({exclusive:t,reverse:n})}}),ho,go,_o,vo,yo,bo=l(()=>{R(),U(),V(),Z(),ho=e=>{if(!e||e.length!==1)throw Error(`DepthToSpace requires 1 input.`);if(e[0].dims.length!==4)throw Error(`DepthToSpace requires 4D input.`)},go=(e,t,n,r)=>{let i=[];i.push(`fn perm(i: ${r.type.indices}) -> ${n.type.indices} {
    var a: ${n.type.indices};`);for(let r=0;r<t;++r)i.push(n.indicesSet(`a`,e[r],`i[${r}]`));return i.push(`return a;}`),i.join(`
`)},_o=(e,t)=>{let n,r,i,a,o,s,c=t.format===`NHWC`,l=t.blocksize,u=t.mode===`DCR`;c?([n,r,i,a]=e.dims,o=u?[n,r,i,l,l,a/l**2]:[n,r,i,a/l**2,l,l],s=u?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([n,r,i,a]=[e.dims[0],e.dims[2],e.dims[3],e.dims[1]],o=u?[n,l,l,a/l**2,r,i]:[n,a/l**2,l,l,r,i],s=u?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let d=e.reshape(o),f=d.dims.length,p=e.dataType,m=Y(`a`,p,f),h=X(`output`,p,f);return{name:`DepthToSpace`,shaderCache:{hint:`${e.dims};${t.blocksize};${t.mode}`,inputDependencies:[`rank`]},getRunData:e=>{let t=c?[n,r*l,i*l,a/l**2]:[n,a/l**2,r*l,i*l],o=H.size(t),u=d.dims,f=H.sortBasedOnPerm(u,s);return{outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:[{type:12,data:o},...K(u,f)]}},getShaderSource:e=>`
  ${e.registerUniform(`output_size`,`u32`).declareVariables(m,h)}

  ${go(s,f,m,h)}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}

    let indices = ${h.offsetToIndices(`global_idx`)};
    let aIndices = perm(indices);

    ${h.setByOffset(`global_idx`,m.getByIndices(`aIndices`))}
  }`}},vo=(e,t)=>{ho(e.inputs),e.compute(_o(e.inputs[0],t))},yo=e=>B({blocksize:e.blocksize,mode:e.mode,format:e.format})}),xo,So,Co,wo,To,Eo,Do,Oo,ko,Ao,jo,Mo=l(()=>{R(),U(),V(),Z(),xo=`[a-zA-Z]|\\.\\.\\.`,So=`(`+xo+`)+`,Co=`^`+So+`$`,wo=`(`+So+`,)*`+So,To=`^`+wo+`$`,Eo=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,t){let n=this.symbolToIndices.get(e);n===void 0?n=[t]:n.push(t),this.symbolToIndices.set(e,n)}},Do=class{constructor(e,t){this.equation=t,this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=[],this.outputDims=[];let[n,r]=t.includes(`->`)?t.split(`->`,2):[t,``];if(!n.match(RegExp(To)))throw Error(`Invalid LHS term`);if(n.split(`,`).forEach((t,n)=>{let r=e[n].dims.slice();if(!t.match(RegExp(Co)))throw Error(`Invalid LHS term`);let i=this.processTerm(t,!0,r,n);this.lhs.push(i)}),r===``)r+=[...this.symbolToInfo.entries()].filter(([e,t])=>t.count===1||e===`...`).map(([e])=>e).join(``);else if(!r.match(RegExp(So)))throw Error(`Invalid RHS`);r.match(RegExp(xo,`g`))?.forEach(e=>{if(e===`...`)this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let t=this.symbolToInfo.get(e);if(t===void 0)throw Error(`Invalid RHS symbol`);this.outputDims.push(t.dimValue)}}),this.rhs=this.processTerm(r,!1,this.outputDims)}addSymbol(e,t,n){let r=this.symbolToInfo.get(e);if(r!==void 0){if(r.dimValue!==t&&r.count!==1)throw Error(`Dimension mismatch`);r.count++,r.inputIndices.push(n)}else r={count:1,dimValue:t,inputIndices:[n]};this.symbolToInfo.set(e,r)}processTerm(e,t,n,r=-1){let i=n.length,a=!1,o=[],s=0;if(!e.match(RegExp(Co))&&!t&&e!==``)throw Error(`Invalid LHS term`);let c=e.match(RegExp(xo,`g`)),l=new Eo(r);return c?.forEach((e,u)=>{if(e===`...`){if(a)throw Error(`Only one ellipsis is allowed per input term`);a=!0;let e=i-c.length+1;if(e<0)throw Error(`Ellipsis out of bounds`);if(o=n.slice(s,s+e),this.hasEllipsis){if(this.ellipsisDims.length!==o.length||this.ellipsisDims.toString()!==o.toString())throw Error(`Ellipsis dimensions mismatch`)}else if(t)this.hasEllipsis=!0,this.ellipsisDims=o;else throw Error(`Ellipsis must be specified in the LHS`);for(let e=0;e<o.length;e++){let t=String.fromCharCode(48+e);l.addSymbol(t,u+e),this.addSymbol(t,n[s++],r)}}else l.addSymbol(e,u+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(e,n[s++],r)}),l}},Oo=e=>e+`_max`,ko=(e,t,n,r)=>{let i=e.map(e=>e.length).map((e,n)=>Y(`input${n}`,t,e)),a=H.size(r),o=X(`output`,t,r.length),s=[...n.symbolToInfo.keys()].filter(e=>!n.rhs.symbolToIndices.has(e));return{name:`Einsum`,shaderCache:{hint:n.equation,inputDependencies:e.map(()=>`rank`)},getRunData:()=>{let i=s.filter(e=>n.symbolToInfo.has(e)).map(e=>({type:12,data:n.symbolToInfo.get(e)?.dimValue||0}));i.push({type:12,data:a});let o=e.map((e,t)=>[...K(e)]).reduce((e,t)=>e.concat(t),i);return o.push(...K(r)),{outputs:[{dims:r,dataType:t}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:o}},getShaderSource:e=>{let t=[],r=[],a=[],c=[],l=[],u=n.symbolToInfo.size===n.rhs.symbolToIndices.size;n.symbolToInfo.forEach((e,s)=>{if(n.rhs.symbolToIndices.has(s)){let r=n.rhs.symbolToIndices.get(s)?.[0];r!==void 0&&n.lhs.forEach((n,a)=>{if(e.inputIndices.includes(a)){let e=n.symbolToIndices.get(s);if(e===void 0)throw Error(`Invalid symbol error`);e.forEach(e=>{t.push(`${i[a].indicesSet(`input${a}Indices`,e,o.indicesGet(`outputIndices`,r))}`)})}})}else n.lhs.forEach((t,n)=>{if(e.inputIndices.includes(n)){let e=t.symbolToIndices.get(s);if(e===void 0)throw Error(`Invalid symbol error`);e.forEach(e=>{r.push(`${i[n].indicesSet(`input${n}Indices`,e,`${s}`)}`)}),l.push(`prod *= ${i[n].getByIndices(`input${n}Indices`)};`)}}),a.push(`for(var ${s}: u32 = 0; ${s} < uniforms.${Oo(s)}; ${s}++) {`),c.push(`}`)});let d=u?[...t,`let sum = ${i.map((e,t)=>e.getByIndices(`input${t}Indices`)).join(` * `)};`]:[...t,`var sum = 0.0;`,...a,...r,`var prod = 1.0;`,...l,`sum += prod;`,...c];return`
            ${e.registerUniforms(s.map(e=>({name:`${Oo(e)}`,type:`u32`}))).registerUniform(`outputSize`,`u32`).declareVariables(...i,o)}

            ${e.mainStart()}
            ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
            var outputIndices = ${o.offsetToIndices(`global_idx`)};
            ${i.map((e,t)=>`var input${t}Indices: ${i[t].type.indices};`).join(`
`)}
            ${d.join(`
`)};
            ${o.setByOffset(`global_idx`,`sum`)};
          }`}}},Ao=(e,t)=>{let n=new Do(e.inputs,t.equation),r=n.outputDims,i=e.inputs.map((e,t)=>e.dims);e.compute(ko(i,e.inputs[0].dataType,n,r))},jo=e=>{let t=e.equation.replace(/\s+/g,``);return B({equation:t})}}),No,Po,Fo,Io,Lo,Ro=l(()=>{R(),U(),Z(),No=e=>{if(!e||e.length!==2)throw Error(`Expand requires 2 input.`);let t=e[0].dims,n=Array.from(e[1].getBigInt64Array(),Number),r=n.length<t.length?0:n.length-t.length,i=t.length<n.length?0:t.length-n.length;for(;r<n.length&&i<t.length;++r,++i)if(n[r]!==t[i]&&n[r]!==1&&t[i]!==1)throw Error(`Expand requires shape to be broadcastable to input`)},Po=(e,t)=>{let n=e.length-t.length,r=[];for(let t=0;t<n;++t)r.push(e[t]);for(let i=0;i<t.length;++i)r.push(t[i]===1?e[i+n]:t[i]);return r},Fo=(e,t)=>e.length>t.length?Po(e,t):Po(t,e),Io=e=>{let t=e[0].dims,n=Array.from(e[1].getBigInt64Array(),Number),r=Fo(t,n),i=e[0].dataType,a=i===9?4:1,o=Math.ceil(H.size(r)/a),s=e=>{let n=Y(`input`,i,t.length,a),o=X(`output`,i,r.length,a),s;if(i===9){let e=(e,t,r=``)=>`
          let outputIndices${t} = ${o.offsetToIndices(`outputOffset + ${t}u`)};
          let offset${t} = ${n.broadcastedIndicesToOffset(`outputIndices${t}`,o)};
          let index${t} = offset${t} / 4u;
          let component${t} = offset${t} % 4u;
          ${e}[${t}] = ${r}(${n.getByOffset(`index${t}`)}[component${t}]);
        `;s=`
        let outputOffset = global_idx * ${a};
        var data = vec4<u32>(0);
        ${e(`data`,0,`u32`)}
        ${e(`data`,1,`u32`)}
        ${e(`data`,2,`u32`)}
        ${e(`data`,3,`u32`)}
        ${o.setByOffset(`global_idx`,`data`)}
      }`}else s=`
        let outputIndices = ${o.offsetToIndices(`global_idx`)};
        let inputOffset = ${n.broadcastedIndicesToOffset(`outputIndices`,o)};
        ${o.setByOffset(`global_idx`,n.getByOffset(`inputOffset`))}
      }`;return`
    ${e.registerUniform(`vec_size`,`u32`).declareVariables(n,o)}
    ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.vec_size`)}
    ${s}`},c=[{type:12,data:o},...K(t,r)];return{name:`Expand`,shaderCache:{hint:`${r.length}`,inputDependencies:[`rank`]},getShaderSource:s,getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:c})}},Lo=e=>{No(e.inputs),e.compute(Io(e.inputs),{inputs:[0]})}}),zo,Bo,Vo=l(()=>{R(),U(),Z(),Di(),zo=e=>{let t=e[0].dataType,n=H.size(e[0].dims),r=H.size(e[1].dims),i=r%4==0;return{name:`FastGeluWithBias`,shaderCache:{hint:`${i}`,inputDependencies:[`type`,`type`]},getShaderSource:e=>{let n=Y(`x`,t,[1],4),r=Y(`bias`,t,[1],4),a=X(`y`,t,[1],4),o=[{name:`output_vec_size`,type:`u32`},{name:`bias_size`,type:`u32`}],s=e=>`
      let bias${e}_offset: u32 = (global_idx * 4 + ${e}) % uniforms.bias_size;
      let bias${e} = ${r.getByOffset(`bias${e}_offset / 4`)}[bias${e}_offset % 4];`,c=i?`
      let bias = ${r.getByOffset(`global_idx % (uniforms.bias_size / 4)`)};`:`${s(0)}${s(1)}${s(2)}${s(3)}
      let bias = ${n.type.value}(bias0, bias1, bias2, bias3);`;return`${e.registerUniforms(o).declareVariables(n,r,a)}

    ${yi(G(t))}

    ${e.mainStart(tn)}
      ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_vec_size`)}

      let x = ${n.getByOffset(`global_idx`)};
      ${c}
      let x_in = x + bias;
      ${a.setByOffset(`global_idx`,bi(`x_in`))}
    }`},getRunData:e=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],programUniforms:[{type:12,data:Math.ceil(n/4)},{type:12,data:r}],dispatchGroup:{x:Math.ceil(n/tn/4)}})}},Bo=e=>{e.inputs.length<2||H.size(e.inputs[1].dims)===0?xi(e):e.compute(zo(e.inputs))}}),Ho,Uo,Wo,Go,Ko=l(()=>{R(),U(),V(),Z(),Ho=e=>{if(!e||e.length!==2)throw Error(`Gather requires 2 inputs.`)},Uo=(e,t)=>{let n=e[0].dims,r=e[1].dims,i=n.length,a=H.normalizeAxis(t.axis,i),o=n.slice(0);o.splice(a,1,...r);let s=n[a],c=e[0].dataType===9?4:1,l=Math.ceil(H.size(o)/c),u=[{type:12,data:l},{type:6,data:s},{type:12,data:a},...K(e[0].dims,e[1].dims,o)];return{name:`Gather`,shaderCache:{hint:t.cacheKey,inputDependencies:[`rank`,`rank`]},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:u}),getShaderSource:t=>{let n=Y(`data`,e[0].dataType,e[0].dims.length,c),s=Y(`inputIndices`,e[1].dataType,e[1].dims.length),l=X(`output`,e[0].dataType,o.length,c),u=e=>{let t=r.length,c=`var indicesIndices${e}  = ${s.type.indices}(0);`;for(let n=0;n<t;n++)c+=`${t>1?`indicesIndices${e}[${n}]`:`indicesIndices${e}`} = ${o.length>1?`outputIndices${e}[uniforms.axis + ${n}]`:`outputIndices${e}`};`;c+=`
          var idx${e} = ${s.getByIndices(`indicesIndices${e}`)};
          if (idx${e} < 0) {
            idx${e} = idx${e} + uniforms.axisDimLimit;
          }
          var dataIndices${e} : ${n.type.indices};
        `;for(let n=0,r=0;n<i;n++)n===a?(c+=`${i>1?`dataIndices${e}[${n}]`:`dataIndices${e}`} = u32(idx${e});`,r+=t):(c+=`${i>1?`dataIndices${e}[${n}]`:`dataIndices${e}`} = ${o.length>1?`outputIndices${e}[${r}]`:`outputIndices${e}`};`,r++);return c},d;if(e[0].dataType===9){let e=(e,t,r=``)=>`
          let outputIndices${t} = ${l.offsetToIndices(`outputOffset + ${t}u`)};
          ${u(t)};
          let offset${t} = ${n.indicesToOffset(`dataIndices${t}`)};
          let index${t} = offset${t} / 4u;
          let component${t} = offset${t} % 4u;
          ${e}[${t}] = ${r}(${n.getByOffset(`index${t}`)}[component${t}]);
        `;d=`
        let outputOffset = global_idx * ${c};
        var value = vec4<u32>(0);
        ${e(`value`,0,`u32`)}
        ${e(`value`,1,`u32`)}
        ${e(`value`,2,`u32`)}
        ${e(`value`,3,`u32`)}
        ${l.setByOffset(`global_idx`,`value`)}
      `}else d=`
      let outputIndices = ${l.offsetToIndices(`global_idx`)};
      ${u(``)};
      let value = ${n.getByIndices(`dataIndices`)};
      ${l.setByOffset(`global_idx`,`value`)};
      `;return`
      ${t.registerUniform(`outputSize`,`u32`).registerUniform(`axisDimLimit`,`i32`).registerUniform(`axis`,`u32`).declareVariables(n,s,l)}
      ${t.mainStart()}
        ${t.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
        ${d}
      }`}}},Wo=e=>B({axis:e.axis}),Go=(e,t)=>{let n=e.inputs;Ho(n),e.compute(Uo(e.inputs,t))}}),qo,Jo,Yo,Xo,Zo=l(()=>{R(),U(),V(),Z(),qo=(e,t)=>{if(e.length<3||e.length>4)throw Error(`GatherBlockQuantized requires 3 or 4 inputs.`);let n=H.normalizeAxis(t.quantizeAxis,e[0].dims.length),r=t.blockSize,i=e[0],a=e[2],o=e.length===4?e[3]:void 0;if(a.dims.length!==i.dims.length||!i.dims.map((e,t)=>t===n?Math.ceil(e/r)===a.dims[t]:e===a.dims[t]).reduce((e,t)=>e&&t,!0))throw Error(`Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.`);if(o){if(o.dataType!==i.dataType)throw Error(`Zero point must have the same data type as the input tensor.`);if(o.dims.length!==a.dims.length||!o.dims.map((e,t)=>e===a.dims[t]).reduce((e,t)=>e&&t,!0))throw Error(`Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.`)}},Jo=(e,t)=>{let n=e[0].dims,r=e[1].dims,i=n.length,a=H.normalizeAxis(t.gatherAxis,i),o=H.normalizeAxis(t.quantizeAxis,i),s=n.slice(0);s.splice(a,1,...r);let c=H.size(s),l=e[2].dataType,u=e[0].dataType===22,d=[{type:12,data:c},{type:12,data:o},{type:12,data:a},{type:12,data:t.blockSize},...K(...e.map((e,t)=>e.dims),s)];return{name:`GatherBlockQuantized`,shaderCache:{hint:`${t.cacheKey};${e.filter((e,t)=>t!==1).map(e=>e.dims.join(`_`)).join(`;`)}`,inputDependencies:Array.from({length:e.length},(e,t)=>`rank`)},getRunData:()=>({outputs:[{dims:s,dataType:l}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:d}),getShaderSource:t=>{let i=Y(`data`,e[0].dataType,e[0].dims.length),o=Y(`inputIndices`,e[1].dataType,e[1].dims.length),c=Y(`scales`,e[2].dataType,e[2].dims.length),d=e.length>3?Y(`zeroPoint`,e[3].dataType,e[3].dims.length):void 0,f=X(`output`,l,s.length),p=[i,o,c];return d&&p.push(d),`
        ${t.registerUniforms([{name:`output_size`,type:`u32`},{name:`quantize_axis`,type:`u32`},{name:`gather_axis`,type:`u32`},{name:`block_size`,type:`u32`}]).declareVariables(...p,f)}
        ${t.mainStart()}
        let output_indices = ${f.offsetToIndices(`global_idx`)};
        var indices_indices = ${o.type.indices}(0);
        ${r.length>1?`
          for (var i: u32 = 0; i < ${r.length}; i++) {
            let index = ${f.indicesGet(`output_indices`,`uniforms.gather_axis + i`)};
            ${o.indicesSet(`indices_indices`,`i`,`index`)};
          }`:`indices_indices = ${f.indicesGet(`output_indices`,`uniforms.gather_axis`)};`};
        var data_indices = ${i.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${f.indicesGet(`output_indices`,`i`)};
          ${i.indicesSet(`data_indices`,`i`,`index`)};
        }
        var index_from_indices = ${o.getByIndices(`indices_indices`)};
        if (index_from_indices < 0) {
          index_from_indices += ${n[a]};
        }
        ${i.indicesSet(`data_indices`,`uniforms.gather_axis`,`u32(index_from_indices)`)};
        for (var i = uniforms.gather_axis + 1; i < ${s.length}; i++) {
          let index = ${f.indicesGet(`output_indices`,`i + ${r.length} - 1`)};
          ${i.indicesSet(`data_indices`,`i`,`index`)};
        }
        let data_offset = ${i.indicesToOffset(`data_indices`)};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${i.getByOffset(`data_offset / 8`)};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${u?`unpack4xI8`:`unpack4xU8`}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${c.indicesGet(`data_indices`,`uniforms.quantize_axis`)} / uniforms.block_size;
        ${c.indicesSet(`scale_indices`,`uniforms.quantize_axis`,`quantize_axis_index`)};
        var scale = ${c.getByIndices(`scale_indices`)};
        ${d?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${d.indicesToOffset(`zero_point_indices`)};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${d.getByOffset(`zero_point_offset / 8`)};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${u?`unpack4xI8`:`unpack4xU8`}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:`var zero_point = 0`};
        let dequantized_data = ${G(l)}(quantized_data - zero_point) * scale;
        ${f.setByOffset(`global_idx`,`dequantized_data`)};
    }`}}},Yo=(e,t)=>{let n=e.inputs;qo(n,t),e.compute(Jo(e.inputs,t))},Xo=e=>B({blockSize:e.blockSize,gatherAxis:e.gatherAxis,quantizeAxis:e.quantizeAxis})}),Qo,$o,es,ts,ns=l(()=>{R(),U(),V(),Z(),Qo=e=>{if(!e||e.length!==2)throw Error(`GatherElements requires 2 inputs.`);if(e[0].dims.length<1)throw Error(`GatherElements requires that the data input be rank >= 1.`);if(e[0].dims.length!==e[1].dims.length)throw Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},$o=(e,t)=>{let n=e[0].dims,r=e[0].dataType,i=n.length,a=e[1].dims,o=e[1].dataType,s=H.normalizeAxis(t.axis,i),c=n[s],l=a.slice(0),u=H.size(l),d=Y(`input`,r,i),f=Y(`indicesInput`,o,a.length),p=X(`output`,r,l.length),m=[{type:12,data:u},{type:6,data:c},{type:12,data:s}];return m.push(...K(n,a,l)),{name:`GatherElements`,shaderCache:{inputDependencies:[`rank`,`rank`]},getRunData:()=>({outputs:[{dims:l,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:m}),getShaderSource:e=>`
      ${e.registerUniform(`outputSize`,`u32`).registerUniform(`axisDimLimit`,`i32`).registerUniform(`axis`,`u32`).declareVariables(d,f,p)}
      ${e.mainStart()}
      ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}

      let outputIndices = ${p.offsetToIndices(`global_idx`)};

      var idx = ${f.getByOffset(`global_idx`)};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${d.type.indices}(outputIndices);
      ${d.indicesSet(`inputIndices`,`uniforms.axis`,`u32(idx)`)};
      let value = ${d.getByIndices(`inputIndices`)};

      ${p.setByOffset(`global_idx`,`value`)};
  }`}},es=e=>B({axis:e.axis}),ts=(e,t)=>{let n=e.inputs;Qo(n),e.compute($o(e.inputs,t))}}),rs,is,as,os,ss=l(()=>{R(),U(),Z(),rs=e=>{if(!e)throw Error(`Input is missing`);if(e.length<2||e.length>3)throw Error(`Invaid input number.`);if(e.length===3&&e[2].dims.length>2)throw Error(`Invalid input shape of C`);if(e[0].dataType!==e[1].dataType||e.length===3&&e[0].dataType!==e[2].dataType)throw Error(`Input types are mismatched`)},is=(e,t)=>{let n=e[0].dims.slice(),r=e[1].dims.slice(),[i,a,o]=Qt.getShapeOfGemmResult(n,t.transA,r,t.transB,e.length===3?e[2].dims:void 0),s=[i,a];if(!s)throw Error(`Can't use gemm on the given tensors`);let c=H.size(s),l=[{type:12,data:c},{type:12,data:i},{type:12,data:a},{type:12,data:o},{type:1,data:t.alpha},{type:1,data:t.beta}],u=[`type`,`type`];return e.length===3&&(l.push(...K(e[2].dims)),u.push(`rank`)),l.push(...K(s)),{name:`Gemm`,shaderCache:{hint:`${t.cacheKey}`,inputDependencies:u},getRunData:()=>({outputs:[{dims:s,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:l}),getShaderSource:n=>{let r=``;t.transA&&t.transB?r=`value += a[k * uniforms.M + m] * b[n * uniforms.K + k];`:t.transA&&!t.transB?r=`value += a[k * uniforms.M + m] * b[k * uniforms.N + n];`:!t.transA&&t.transB?r=`value += a[m * uniforms.K + k] * b[n * uniforms.K + k];`:!t.transA&&!t.transB&&(r=`value += a[m * uniforms.K + k] * b[k * uniforms.N + n];`);let i=t.alpha===1?``:`value *= uniforms.alpha;`,a=Y(`a`,e[0].dataType,e[0].dims),o=Y(`b`,e[1].dataType,e[1].dims),c=a.type.value,l=null,u=[a,o];e.length===3&&(l=Y(`c`,e[2].dataType,e[2].dims.length),u.push(l));let d=X(`output`,e[0].dataType,s.length);return u.push(d),`
  ${n.registerUniforms([{name:`output_size`,type:`u32`},{name:`M`,type:`u32`},{name:`N`,type:`u32`},{name:`K`,type:`u32`},{name:`alpha`,type:`f32`},{name:`beta`,type:`f32`}]).declareVariables(...u)}

  ${n.mainStart()}
    ${n.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${c}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${r}
    }

    ${i}
    ${l==null?``:`let cOffset = ${l.broadcastedIndicesToOffset(`vec2(m, n)`,d)}; value += ${c}(uniforms.beta) * ${l.getByOffset(`cOffset`)};`}
    output[global_idx] = value;
  }`}}},as=e=>({transA:e.transA,transB:e.transB,alpha:e.alpha,beta:e.beta,cacheKey:`${e.transA};${e.transB};${e.alpha===1}`}),os=(e,t)=>{rs(e.inputs),e.compute(is(e.inputs,t))}}),cs,ls,us,ds,fs,ps,ms,hs=l(()=>{R(),U(),V(),Lt(),Dr(),Z(),bn(),cs=(e,t)=>e.length>t&&e[t].dims.length>0?e[t]:void 0,ls=(e,t)=>{let n=e[0],r=cs(e,1),i=cs(e,2),a=cs(e,3),o=cs(e,4),s=cs(e,5),c=cs(e,6),l=cs(e,7);if(n.dims.length!==3&&n.dims.length!==5)throw Error(`Input query is expected to have 3 or 5 dimensions`);let u=n.dims[0],d=n.dims[1],f=n.dims.length===3?n.dims[2]:t.numHeads*n.dims[4],p=d,m=0,h=0,g=Math.floor(f/t.numHeads);if(c&&l&&H.size(c.dims)&&H.size(l.dims)){if(c.dims.length!==4)throw Error(`Input "past_key" is expected to have 4 dimensions`);if(c.dims[0]!==u||c.dims[1]!==t.numHeads||c.dims[3]!==g)throw Error(`Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)`);if(l.dims[0]!==u||l.dims[1]!==t.numHeads||l.dims[3]!==g)throw Error(`Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)`);if(c.dims[2]!==l.dims[2])throw Error(`Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)`);if(l.dims.length!==4)throw Error(`Input "past_value" is expected to have 4 dimensions`);m=c.dims[2],h=c.dims[2]}else if(c&&H.size(c.dims)||l&&H.size(l.dims))throw Error(`Input "past_key" and "past_value" shall be both present or both absent`);let _;if(r&&H.size(r.dims)>0){if(n.dims.length!==3)throw Error(`Input "query" is expected to have 3 dimensions when key is given`);if(r.dims.length<3||r.dims.length>5)throw Error(`Input "key" is expected to have 3, 4, or 5 dimensions`);if(n.dims[0]!==r.dims[0])throw Error(`Input "query" and "key" shall have same dim 0 (batch size)`);if(r.dims.length===3){if(r.dims[2]!==n.dims[2])throw Error(`Input "query" and "key" shall have same dim 2 (hidden_size)`);_=2,p=r.dims[1]}else if(r.dims.length===5){if(r.dims[2]!==t.numHeads||r.dims[3]!==2||r.dims[4]!==g)throw Error(`Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv`);if(i)throw Error(`Expect "value" be none when "key" has packed kv format.`);_=5,p=r.dims[1]}else{if(r.dims[1]!==t.numHeads||r.dims[3]!==g)throw Error(`Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key`);_=0,p=r.dims[2]}}else{if(n.dims.length!==5)throw Error(`Input "query" is expected to have 5 dimensions when key is empty`);if(n.dims[2]!==t.numHeads||n.dims[3]!==3)throw Error(`Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv`);_=3}if(a&&H.size(a.dims)>0){if(a.dims.length!==1)throw Error(`Input "bias" is expected to have 1 dimension`);if(r&&r.dims.length===5&&r.dims[3]===2)throw Error(`bias is not allowed for packed kv.`)}let v=m+p,y=0;if(o&&H.size(o.dims)>0){y=8;let e=o.dims;throw e.length===1?e[0]===u?y=1:e[0]===3*u+2&&(y=3):e.length===2&&e[0]===u&&e[1]===v&&(y=5),Error(y===8?`Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)`:`Mask not supported`)}let b=!1,x=f;if(i&&H.size(i.dims)>0){if(i.dims.length!==3&&i.dims.length!==4)throw Error(`Input "value" is expected to have 3 or 4 dimensions`);if(n.dims[0]!==i.dims[0])throw Error(`Input "query" and "value" shall have same dim 0 (batch_size)`);if(i.dims.length===3){if(p!==i.dims[1])throw Error(`Input "key" and "value" shall have the same dim 1 (kv_sequence_length)`);x=i.dims[2]}else{if(p!==i.dims[2])throw Error(`Input "key" and "value" shall have the same dim 2 (kv_sequence_length)`);x=i.dims[1]*i.dims[3],b=!0}}if(o&&H.size(o.dims)>0)throw Error(`Key padding mask is not supported`);if(s&&H.size(s.dims)>0){if(s.dims.length!==4)throw Error(`Input "attention_bias" is expected to have 4 dimensions`);if(s.dims[0]!==u||s.dims[1]!==t.numHeads||s.dims[2]!==d||s.dims[3]!==v)throw Error(`Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)`)}return{batchSize:u,sequenceLength:d,pastSequenceLength:m,kvSequenceLength:p,totalSequenceLength:v,maxSequenceLength:h,inputHiddenSize:0,hiddenSize:f,vHiddenSize:x,headSize:g,vHeadSize:Math.floor(x/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:y,scale:t.scale,broadcastResPosBias:!1,passPastInKv:b,qkvFormat:_}},us=e=>B({...e}),ds=B({perm:[0,2,1,3]}),fs=(e,t,n,r,i,a,o)=>{let s=[r,i,a],c=H.size(s),l=[{type:12,data:c},{type:12,data:o},{type:12,data:a}];return e.compute({name:`MultiHeadAttentionAddBias`,shaderCache:{inputDependencies:[`type`,`type`]},getRunData:()=>({outputs:[{dims:s,dataType:t.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:l}),getShaderSource:e=>{let r=X(`qkv_with_bias`,t.dataType,s),i=Y(`qkv`,t.dataType,s),a=Y(`bias`,n.dataType,s);return`
  ${e.registerUniforms([{name:`output_size`,type:`u32`},{name:`bias_offset`,type:`u32`},{name:`hidden_size`,type:`u32`}]).declareVariables(i,a,r)}
  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`}},{inputs:[t,n],outputs:[-1]})[0]},ps=(e,t,n,r,i,a,o,s)=>{let c=a;if(o&&H.size(o.dims)>0){if(r===1)throw Error(`AddBiasReshape is not implemented. Please export your model with packed QKV or KV`);return c=fs(e,a,o,t,r,n*i,s),c=c.reshape([t,r,n,i]),n===1||r===1?c:e.compute(_n(c,ds.perm),{inputs:[c],outputs:[-1]})[0]}else return a.dims.length===3&&(c=a.reshape([t,r,n,i])),n===1||r===1?c:e.compute(_n(c,ds.perm),{inputs:[c],outputs:[-1]})[0]},ms=(e,t)=>{let n=ls(e.inputs,t),r=e.inputs[0],i=cs(e.inputs,1),a=cs(e.inputs,2),o=cs(e.inputs,3),s=cs(e.inputs,4),c=cs(e.inputs,5),l=cs(e.inputs,6),u=cs(e.inputs,7);if(r.dims.length===5)throw Error(`Packed QKV is not implemented`);if(i?.dims.length===5)throw Error(`Packed KV is not implemented`);let d=i&&a&&i.dims.length===4&&a.dims.length===4,f=ps(e,n.batchSize,n.numHeads,n.sequenceLength,n.headSize,r,o,0);if(d)return wr(e,f,i,a,s,void 0,l,u,c,n,t);if(!i||!a)throw Error(`key and value must be provided`);let p=ps(e,n.batchSize,n.numHeads,n.kvSequenceLength,n.headSize,i,o,n.hiddenSize),m=ps(e,n.batchSize,n.numHeads,n.kvSequenceLength,n.vHeadSize,a,o,2*n.hiddenSize);wr(e,f,p,m,s,void 0,l,u,c,n,t)}}),gs,_s,vs,ys,bs,xs=l(()=>{R(),U(),Z(),gs=e=>Array.from(e.getBigInt64Array(),Number),_s=e=>{if(!e||e.length!==2)throw Error(`Tile requires 2 inputs.`);if(e[0].dataType!==1&&e[0].dataType!==10&&e[0].dataType!==6&&e[0].dataType!==12)throw Error(`Tile only support float, float16, int32, and uint32 data types`);if(e[1].dataType!==7)throw Error("Tile `repeats` input should be of int64 data type");if(e[1].dims.length!==1)throw Error("Tile `repeats` input should be 1-D");if(gs(e[1]).length!==e[0].dims.length)throw Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},vs=(e,t)=>{let n=[];for(let r=0;r<e.length;++r)n.push(e[r]*t[r]);return n},ys=(e,t)=>{let n=e[0].dims,r=t??gs(e[1]),i=vs(n,r),a=H.size(i),o=e[0].dataType,s=Y(`input`,o,n.length),c=X(`output`,o,i.length);return{name:`Tile`,shaderCache:{hint:`${r}`,inputDependencies:[`rank`]},getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:[{type:12,data:a},...K(e[0].dims,i)]}),getShaderSource:e=>`
      const inputShape = ${s.indices(...n)};
      ${e.registerUniform(`output_size`,`u32`).declareVariables(s,c)}
      ${e.mainStart()}
      ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
      let output_indices = ${c.offsetToIndices(`global_idx`)};
      var input_indices: ${s.type.indices};
      for (var i = 0; i < ${n.length}; i++) {
        let input_dim_i = ${s.indicesGet(`uniforms.input_shape`,`i`)};
        let input_dim_value = ${c.indicesGet(`output_indices`,`i`)}  % input_dim_i;

        ${s.indicesSet(`input_indices`,`i`,`input_dim_value`)}
      }
      ${c.setByOffset(`global_idx`,s.getByIndices(`input_indices`))}
    }`}},bs=e=>{_s(e.inputs),e.compute(ys(e.inputs),{inputs:[0]})}}),Ss,Cs,ws,Ts,Es,Ds,Os=l(()=>{R(),U(),V(),Dr(),Z(),hs(),xs(),bn(),Ss=(e,t)=>{let n=e[0],r=e[1],i=e[2],a=e[3],o=e[4];if(n.dims.length!==3&&n.dims.length!==5)throw Error(`Input query is expected to have 3 or 5 dimensions`);let s=n.dims[0],c=n.dims[1],l=n.dims.length===3?n.dims[2]:t.numHeads*n.dims[4],u=c,d=0,f=0,p=Math.floor(l/t.numHeads),m=a&&a.dims.length!==0,h=o&&o.dims.length!==0;if(m&&h){if(a.dims.length!==4)throw Error(`Input "past_key" is expected to have 4 dimensions`);if(o.dims.length!==4)throw Error(`Input "past_value" is expected to have 4 dimensions`);d=a.dims[1],f=a.dims[1]}else if(m||h)throw Error(`Input "past_key" and "past_value" shall be both present or both absent`);let g;if(r){if(n.dims.length!==3)throw Error(`Input "query" is expected to have 3 dimensions when key is given`);if(r.dims.length<3||r.dims.length>5)throw Error(`Input "key" is expected to have 3, 4, or 5 dimensions`);if(n.dims[0]!==r.dims[0])throw Error(`Input "query" and "key" shall have same dim 0 (batch size)`);if(r.dims.length===3){if(n.dims[2]%r.dims[2]!==0)throw Error(`Dimension 2 of "query" should be a multiple of "key"`);g=2,u=r.dims[1]}else if(r.dims.length===5){if(r.dims[2]!==t.numHeads||r.dims[3]!==2||r.dims[4]!==p)throw Error(`Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv`);if(i)throw Error(`Expect "value" be none when "key" has packed kv format.`);g=5,u=r.dims[1]}else{if(r.dims[1]!==t.numHeads||r.dims[3]!==p)throw Error(`Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key`);g=0,u=r.dims[2]}}else{if(n.dims.length!==3&&n.dims.length!==5)throw Error(`Input "query" is expected to have 3 or 5 dimensions when key is empty`);if(n.dims.length===5&&(n.dims[2]!==t.numHeads||n.dims[3]!==3))throw Error(`Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv`);g=3}let _=!1,v=l;if(i){if(i.dims.length!==3&&i.dims.length!==4)throw Error(`Input "value" is expected to have 3 or 4 dimensions`);if(n.dims[0]!==i.dims[0])throw Error(`Input "query" and "value" shall have same dim 0 (batch_size)`);if(i.dims.length===3){if(u!==i.dims[1])throw Error(`Input "key" and "value" shall have the same dim 1 (kv_sequence_length)`);v=i.dims[2]}else{if(u!==i.dims[2])throw Error(`Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)`);v=i.dims[1]*i.dims[3],_=!0}}let y=d+u;return{batchSize:s,sequenceLength:c,pastSequenceLength:d,kvSequenceLength:u,totalSequenceLength:y,maxSequenceLength:f,inputHiddenSize:0,hiddenSize:l,vHiddenSize:v,headSize:p,vHeadSize:Math.floor(v/t.kvNumHeads),numHeads:t.numHeads,kvNumHeads:t.kvNumHeads,nReps:t.numHeads/t.kvNumHeads,pastPresentShareBuffer:!1,maskType:0,scale:t.scale,broadcastResPosBias:!1,passPastInKv:_,qkvFormat:g,isPastkvBSNH:!0}},Cs=(e,t,n,r)=>{let i=[r.batchSize,r.totalSequenceLength,r.kvNumHeads,r.headSize],a=H.size(i)/4,o=r.totalSequenceLength,s=X(`present_kv`,n,i.length,4),c=Y(`new_kv`,e.dataType,e.dims.length,4),l=t?Y(`past_kv`,t.dataType,t.dims.length,4):void 0,u=Math.ceil(r.headSize/4),d={x:o,y:e.dims[0],z:1},f=t?[`rank`,`rank`]:[`rank`],p=[{type:12,data:a},{type:12,data:r.pastSequenceLength},{type:12,data:r.kvSequenceLength},{type:12,data:r.totalSequenceLength}],m=[c];l?(p.push(...K(e.dims),...K(t.dims),...K(i)),m.push(l)):p.push(...K(e.dims),...K(i));let h=[{name:`output_size`,type:`u32`},{name:`past_seqlen`,type:`u32`},{name:`new_seqlen`,type:`u32`},{name:`present_seqlen`,type:`u32`}],g=`      let new_batch_stride = uniforms.new_seqlen * num_heads * H;
        let new_row_stride = num_heads * H;
        let new_head_stride = H;
        let in_offset = b * new_batch_stride + (s - past_seqlen) * new_row_stride + n * new_head_stride + h;
        present_kv[out_offset] = new_kv[in_offset];`,_=t?`if (s < past_seqlen) {
              let past_batch_stride = uniforms.past_seqlen * num_heads * H;
        var past_head_stride = uniforms.past_seqlen * H;
        if (is_bsnh) {
          past_head_stride = H;
        }
        let in_offset = b * past_batch_stride + s * row_stride + n * past_head_stride + h;
        present_kv[out_offset] = past_kv[in_offset];
        } else if (s < past_seqlen + uniforms.new_seqlen) {
        ${g}
        }`:`if (s < past_seqlen + uniforms.new_seqlen) {
          ${g}
        }`;return{name:`ConcatPastNew`,shaderCache:{hint:`${r.kvNumHeads}${u}${!!t}`,inputDependencies:f},getRunData:()=>({outputs:[{dims:i,dataType:n}],dispatchGroup:d,programUniforms:p}),getShaderSource:e=>`

  ${e.registerUniforms(h).declareVariables(...m,s)}
  ${e.mainStart([u,r.kvNumHeads,1])}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
    var indices = ${s.offsetToIndices(`global_idx`)};
    let h = local_id.x;
    let n = local_id.y;
    let s = workgroup_id.x;
    let b = workgroup_id.y;
    let num_heads = ${r.kvNumHeads}u;
    let H = ${u}u;

    let present_seqlen = uniforms.present_seqlen;
    let present_batch_stride = present_seqlen * num_heads * H;
    var row_stride = H;
    let is_bsnh = ${r.isPastkvBSNH};

    if (is_bsnh) {
      row_stride = num_heads * H;
    }
    var present_head_stride = present_seqlen * H;
    if (is_bsnh) {
      present_head_stride = H;
    }

    let past_seqlen = uniforms.past_seqlen;

    let out_offset = b * present_batch_stride + s * row_stride + n * present_head_stride + h;
    ${_}
  }`}},ws=e=>B({...e}),Ts=B({perm:[0,2,1,3]}),Es=(e,t,n,r,i)=>{let a=t,o=r.kvNumHeads,s=r.nReps;return t.dims.length===3&&r.kvSequenceLength!==0&&(a=t.reshape([r.batchSize,r.kvSequenceLength,o,r.headSize])),a=n?e.compute(Cs(a,n,a.dataType,r),{inputs:[a,n],outputs:[r.isPastkvBSNH?i:-1]})[0]:e.compute(Cs(a,void 0,a.dataType,r),{inputs:[a],outputs:[r.isPastkvBSNH?i:-1]})[0],s!==1&&(a=e.compute(ys([a],[1,1,1,s]),{inputs:[a],outputs:[-1]})[0],a=a.reshape([r.batchSize,r.totalSequenceLength,o*s,r.headSize])),e.compute(_n(a,Ts.perm),{inputs:[a],outputs:[-1]})[0]},Ds=(e,t)=>{let n=Ss(e.inputs,t);if(e.inputs[0].dims.length===5)throw Error(`Packed QKV is not implemented`);if(e.inputs[1]?.dims.length===5)throw Error(`Packed KV is not implemented`);let r=ps(e,n.batchSize,n.numHeads,n.sequenceLength,n.headSize,e.inputs[0],void 0,0),i=e.inputs[3]&&e.inputs[3].dims.length!==0?e.inputs[3]:void 0,a=e.inputs[4]&&e.inputs[4].dims.length!==0?e.inputs[4]:void 0,o=Es(e,e.inputs[1],i,n,1),s=Es(e,e.inputs[2],a,n,2);wr(e,r,o,s,void 0,void 0,void 0,void 0,void 0,n,t)}}),ks,As,js,Ms,Ns=l(()=>{R(),U(),bn(),Z(),ks=(e,t,n,r,i,a,o,s)=>{let c=q(a),l=c===1?`f32`:`vec${c}f`,u=c===1?`vec2f`:`mat2x${c}f`,d=i*o,f=[i,o,a/c],p=[i,o,2],m=[`rank`,`type`,`type`],h=[];return h.push(...K(f,p)),e.compute({name:`InstanceNormComputeChannelScaleShift`,shaderCache:{hint:`${c};${s}`,inputDependencies:m},getRunData:()=>({outputs:[{dims:p,dataType:1}],dispatchGroup:{x:d},programUniforms:h}),getShaderSource:e=>{let i=Y(`x`,t.dataType,3,c),a=[i,Y(`scale`,n.dataType,n.dims),Y(`bias`,r.dataType,r.dims),X(`output`,1,3,2)];return`
  var<workgroup> workgroup_shared : array<${u}, 64>;
  const workgroup_size = 64u;
  ${e.declareVariables(...a)}
  ${e.mainStart(64)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${l}(0);
    var squared_sum = ${l}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${l}(${i.get(`batch`,`channel`,`h`)});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${u}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${on(`workgroup_shared[0][0]`,c)} / f32(hight * ${c});
      let squared_sum_final = ${on(`workgroup_shared[0][1]`,c)} / f32(hight * ${c});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${s}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`}},{inputs:[t,n,r],outputs:[-1]})[0]},As=(e,t,n)=>{let r=t[0].dims,i=r,a=r[0],o=r[1],s=H.sizeFromDimension(r,2),c=q(s),l=H.size(i)/c,u=ks(e,t[0],t[1],t[2],a,s,o,n.epsilon),d=[a,o,s/c],f=[a,o];e.compute({name:`InstanceNormalization`,shaderCache:{hint:`${c}`,inputDependencies:[`type`,`none`]},getRunData:()=>({outputs:[{dims:i,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:[{type:12,data:l},...K(d,f,d)]}),getShaderSource:e=>{let n=Y(`x`,t[0].dataType,d.length,c),r=Y(`scale_shift`,1,f.length,2),i=X(`output`,t[0].dataType,d.length,c),a=[n,r,i];return`
  ${e.registerUniform(`output_size`,`u32`).declareVariables(...a)}
  ${e.mainStart()}
  ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
      let outputIndices = ${i.offsetToIndices(`global_idx`)};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${r.getByIndices(`vec2<u32>(batch, channel)`)};
      let value = ${n.getByOffset(`global_idx`)} * ${i.type.value}(scale_shift.x) + ${i.type.value}(scale_shift.y);
      ${i.setByOffset(`global_idx`,`value`)};
  }`}},{inputs:[t[0],u]})},js=(e,t,n)=>{let r=t[0].dims,i=r,a=r[0],o=r[r.length-1],s=H.sizeFromDimension(r,1)/o,c=q(o),l=H.size(i)/c,u=[{type:12,data:s},{type:12,data:Math.floor(o/c)}],d=[`type`,`type`],f=[0,r.length-1];for(let e=0;e<r.length-2;e++)f.push(e+1);let p=e.compute(_n(e.inputs[0],f),{inputs:[e.inputs[0]],outputs:[-1]})[0],m=ks(e,p,t[1],t[2],a,s,o,n.epsilon);e.compute({name:`InstanceNormalizationNHWC`,shaderCache:{hint:`${c}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:i,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:u}),getShaderSource:e=>{let n=W(t[0].dataType),r=c===1?`vec2f`:`mat${c}x2f`,a=e=>{let t=e===0?`x`:`y`,r=c===1?`f32`:`vec${c}f`;switch(c){case 1:return`${n}(${r}(scale.${t}))`;case 2:return`vec2<${n}>(${r}(scale[0].${t}, scale[1].${t}))`;case 4:return`vec4<${n}>(${r}(scale[0].${t}, scale[1].${t}, scale[2].${t}, scale[3].${t}))`;default:throw Error(`Not supported compoents ${c}`)}},o=Y(`input`,t[0].dataType,t[0].dims,c),s=X(`output`,t[0].dataType,i,c);return`
  @group(0) @binding(0) var<storage, read> input : array<${o.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${r}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${s.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${e.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${a(0)}, ${a(1)});
  }`}},{inputs:[t[0],m]})},Ms=(e,t)=>{t.format===`NHWC`?js(e,e.inputs,t):As(e,e.inputs,t)}}),Ps,Fs,Is,Ls=l(()=>{R(),U(),Z(),Ps=e=>{if(!e||e.length<2)throw Error(`layerNorm requires at least 2 inputs.`)},Fs=(e,t,n)=>{let r=t.simplified,i=e[0].dims,a=e[1],o=!r&&e[2],s=i,c=H.normalizeAxis(t.axis,i.length),l=H.sizeToDimension(i,c),u=H.sizeFromDimension(i,c),d=H.size(a.dims),f=o?H.size(o.dims):0;if(d!==u||o&&f!==u)throw Error(`Size of X.shape()[axis:] == ${u}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${d} and bias size of ${f}`);let p=[];for(let e=0;e<i.length;++e)e<c?p.push(i[e]):p.push(1);let m=q(u),h=[`type`,`type`],g=[{type:12,data:l},{type:1,data:u},{type:12,data:Math.floor(u/m)},{type:1,data:t.epsilon}];o&&h.push(`type`);let _=n>1,v=n>2,y=t=>{let n=W(e[0].dataType),i=[Y(`x`,e[0].dataType,e[0].dims,m),Y(`scale`,a.dataType,a.dims,m)];return o&&i.push(Y(`bias`,o.dataType,o.dims,m)),i.push(X(`output`,e[0].dataType,s,m)),_&&i.push(X(`mean_data_output`,1,p)),v&&i.push(X(`inv_std_output`,1,p)),`
  ${t.registerUniforms([{name:`norm_count`,type:`u32`},{name:`norm_size`,type:`f32`},{name:`norm_size_vectorized`,type:`u32`},{name:`epsilon`,type:`f32`}]).declareVariables(...i)}
  ${t.mainStart()}
    ${t.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.norm_count`)}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${rn(`f32`,m)};
    var mean_square_vector = ${rn(`f32`,m)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${an(n,m,`x[h + offset]`)};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${on(`mean_vector`,m)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${on(`mean_square_vector`,m)} / uniforms.norm_size ${r?``:`- mean * mean`} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${an(n,m,`x[j + offset]`)};
      let f32scale = ${an(n,m,`scale[j]`)};
      output[j + offset] = ${i[0].type.value}((f32input ${r?``:`- mean`}) * inv_std_dev * f32scale
        ${o?`+ ${an(n,m,`bias[j]`)}`:``}
      );
    }

    ${_?`mean_data_output[global_idx] = mean`:``};
    ${v?`inv_std_output[global_idx] = inv_std_dev`:``};
  }`},b=[{dims:s,dataType:e[0].dataType}];return _&&b.push({dims:p,dataType:1}),v&&b.push({dims:p,dataType:1}),{name:`LayerNormalization`,shaderCache:{hint:`${m};${n};${r}`,inputDependencies:h},getRunData:()=>({outputs:b,dispatchGroup:{x:Math.ceil(l/64)},programUniforms:g}),getShaderSource:y}},Is=(e,t)=>{Ps(e.inputs),e.compute(Fs(e.inputs,t,e.outputCount))}}),Rs,zs,Bs,Vs,Hs,Us=l(()=>{R(),U(),V(),Z(),Rs=(e,t)=>{if(e.length<3||e.length>4)throw Error(`MatMulNBits requires 3 or 4 inputs`);let n=e[0],r=n.dims.length;if(n.dims[r-1]!==t.k)throw Error(`The last dim of input shape does not match the k value`);let i=Math.floor((t.k+t.blockSize-1)/t.blockSize),a=t.blockSize/8*t.bits,o=e[1];if(!H.areEqual(o.dims,[t.n,i,a]))throw Error(`The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize`);let s=e[2].dims;if(H.size(s)!==t.n*i)throw Error(`scales input size error.`);if(e.length===4){let n=e[3].dims,r=t.bits>4?t.n*i:t.n*Math.floor((i+1)/2);if(H.size(n)!==r)throw Error(`zeroPoints input size error.`)}},zs=(e,t)=>{let n=e[0].dims,r=n.length,i=n[r-2],a=t.k,o=t.n,s=n.slice(0,r-2),c=H.size(s),l=e[1].dims[2]/4,u=e[0].dataType,d=q(t.k),f=q(l),p=q(o),m=s.concat([i,o]),h=i>1&&o/p%2==0?2:1,g=H.size(m)/p/h,_=[],v=[c,i,a/d],y=H.convertShape(e[1].dims).slice();y.splice(-1,1,l/f),_.push(...K(v)),_.push(...K(y)),_.push(...K(e[2].dims)),e.length===4&&_.push(...K(H.convertShape(e[3].dims)));let b=[c,i,o/p];return _.push(...K(b)),{name:`MatMulNBits`,shaderCache:{hint:`${t.blockSize};${t.bits};${d};${f};${p};${h};64`,inputDependencies:Array(e.length).fill(`rank`)},getRunData:()=>({outputs:[{dims:m,dataType:u}],dispatchGroup:{x:g},programUniforms:_}),getShaderSource:n=>{let r=v.length,i=Y(`a`,e[0].dataType,r,d),a=Y(`b`,12,y.length,f),o=Y(`scales`,e[2].dataType,e[2].dims.length),s=[i,a,o],c=e.length===4?Y(`zero_points`,12,e[3].dims.length):void 0;c&&s.push(c);let u=b.length,m=X(`output`,e[0].dataType,u,p),g=W(e[0].dataType),_=(()=>{switch(d){case 1:return`array<${g}, 8>`;case 2:return`mat4x2<${g}>`;case 4:return`mat2x4<${g}>`;default:throw Error(`${d}-component is not supported.`)}})(),x=()=>{let e=`
          // reuse a data
            var input_offset = ${i.indicesToOffset(`${i.type.indices}(batch, row, word_offset)`)};
            var a_data: ${_};
            for (var j: u32 = 0; j < ${8/d}; j++) {
              a_data[j] = ${i.getByOffset(`input_offset`)};
              input_offset++;
            }
          `;for(let t=0;t<p*h;t++)e+=`
            b_value = ${f===1?`b${t}_data`:`b${t}_data[i]`};
            b_value_lower = unpack4xU8(b_value & b_mask);
            b_value_upper = unpack4xU8((b_value >> 4) & b_mask);
            b_quantized_values = ${_}(${Array.from({length:4},(e,t)=>`${g}(b_value_lower[${t}]), ${g}(b_value_upper[${t}])`).join(`, `)});
            b_dequantized_values = ${d===1?`${_}(${Array.from({length:8},(e,n)=>`(b_quantized_values[${n}] - ${c?`zero_point${t}`:`zero_point`}) * scale${t}`).join(`, `)});`:`(b_quantized_values - ${_}(${Array(8).fill(`${c?`zero_point${t}`:`zero_point`}`).join(`,`)})) * scale${t};`};
            workgroup_shared[local_id.x * ${h} + ${Math.floor(t/p)}]${p>1?`[${t%p}]`:``} += ${Array.from({length:8/d},(e,t)=>`${d===1?`a_data[${t}] * b_dequantized_values[${t}]`:`dot(a_data[${t}], b_dequantized_values[${t}])`}`).join(` + `)};
          `;return e},S=()=>{let e=`
            var col_index = col * ${p};
            ${c?`
            let zero_point_bytes_per_col = (nBlocksPerCol + 1) / 2;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${g}(8);`}
            `;for(let t=0;t<p*h;t++)e+=`
            let scale${t} = ${o.getByOffset(`col_index * nBlocksPerCol + block`)};
            ${c?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block >> 0x1u);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            zero_point_word = ${c.getByOffset(`zero_point_word_index`)} >> zero_point_bits_offset;
            let zero_point${t} = ${g}((zero_point_word) & 0xFu);`:``}
            col_index += 1;`;return e},C=()=>{let e=`col_index = col * ${p};`;for(let t=0;t<p*h;t++)e+=`
            let b${t}_data = ${a.getByIndices(`${a.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return e+=`
            var b_value: u32;
            let b_mask: u32 = 0x0F0F0F0Fu;
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${_};
            var b_dequantized_values: ${_};`,e};return`
        var<workgroup> workgroup_shared: array<${m.type.value}, ${h*64}>;
        ${n.declareVariables(...s,m)}
        ${n.mainStart([64,1,1])}
          let output_indices = ${m.offsetToIndices(`(global_idx / 64) * ${h}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += 64) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize/d};
            ${S()}
            for (var word: u32 = 0; word < ${l}; word += ${f}) {
              ${C()}
              for (var i: u32 = 0; i < ${f}; i++) {
                ${x()}
                word_offset += ${8/d};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${h}) {
            var output_value: ${m.type.value} = ${m.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < 64u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${h};
            }
            ${m.setByIndices(`${m.type.indices}(batch, row, col + local_id.x)`,`output_value`)};
          }
        }`}}},Bs=(e,t)=>{let n=e[0].dims,r=n.length,i=n[r-2],a=t.k,o=t.n,s=n.slice(0,r-2),c=H.size(s),l=e[1].dims[2]/4,u=e[0].dataType,d=q(t.k),f=q(l),p=s.concat([i,o]),m=o%8==0?8:o%4==0?4:1,h=128/m,g=h*f*8,_=g/d,v=g/t.blockSize,y=H.size(p)/m,b=[],x=[c,i,a/d],S=H.convertShape(e[1].dims).slice();S.splice(-1,1,l/f),b.push(...K(x)),b.push(...K(S)),b.push(...K(e[2].dims)),e.length===4&&b.push(...K(H.convertShape(e[3].dims)));let C=[c,i,o];return b.push(...K(C)),{name:`BlockwiseMatMulNBits32`,shaderCache:{hint:`${t.blockSize};${d};${f};${h};${m}`,inputDependencies:Array(e.length).fill(`rank`)},getRunData:()=>({outputs:[{dims:p,dataType:u}],dispatchGroup:{x:y},programUniforms:b}),getShaderSource:n=>{let r=x.length,i=Y(`a`,e[0].dataType,r,d),a=Y(`b`,12,S.length,f),o=Y(`scales`,e[2].dataType,e[2].dims.length),s=[i,a,o],c=e.length===4?Y(`zero_points`,12,e[3].dims.length):void 0;c&&s.push(c);let l=C.length,u=X(`output`,e[0].dataType,l),p=W(e[0].dataType),g=()=>{switch(d){case 1:return`
          let a_data0 = vec4<${p}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${p}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${p}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${p}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw Error(`${d}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${i.type.value}, ${_}>;
        var<workgroup> inter_results: array<array<${u.type.value}, ${h}>, ${m}>;
        ${n.declareVariables(...s,u)}
        ${n.mainStart([h,m,1])}
          let output_indices = ${u.offsetToIndices(`workgroup_index * ${m}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${v} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${_};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${_}; a_offset += 128)
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${i.getByIndices(`${i.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${i.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${v} + local_id.x;
            ${c?`
            let zero_point_bytes_per_col = (n_blocks_per_col + 1) / 2;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block >> 0x1u);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            let zero_point_word = ${c.getByOffset(`zero_point_word_index`)} >> zero_point_bits_offset;
            let zero_point = ${p}((zero_point_word) & 0xFu);`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${p}(8);`}
            let scale = ${o.getByOffset(`b_row * n_blocks_per_col + block`)};
            let b_data = ${a.getByIndices(`${a.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize/d};
            for (var i: u32 = 0; i < ${f}; i++) {
              ${g()}
              let b_value = ${f===1?`b_data`:`b_data[i]`};
              let b_value_lower = unpack4xU8(b_value & 0x0F0F0F0Fu);
              let b_value_upper = unpack4xU8((b_value >> 4) & 0x0F0F0F0Fu);
              let b_quantized_values = mat2x4<${p}>(${Array.from({length:4},(e,t)=>`${p}(b_value_lower[${t}]), ${p}(b_value_upper[${t}])`).join(`, `)});
              let b_dequantized_values = (b_quantized_values - mat2x4<${p}>(${Array(8).fill(`zero_point`).join(`,`)})) * scale;
              inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(e,t)=>`${`dot(a_data${t}, b_dequantized_values[${t}])`}`).join(` + `)};
              word_offset += ${8/d};
            }
            workgroupBarrier();
          }

          if (local_idx < ${m}) {
            var output_value: ${u.type.value} = ${u.type.value}(0);
            for (var b = 0u; b < ${h}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${u.setByIndices(`${u.type.indices}(batch, row, col + local_idx)`,`output_value`)}
            }
          }
        }`}}},Vs=(e,t)=>{Rs(e.inputs,t),t.blockSize===32&&e.adapterInfo.isVendor(`intel`)&&e.adapterInfo.isArchitecture(`gen-12lp`)?e.compute(Bs(e.inputs,t)):e.compute(zs(e.inputs,t))},Hs=e=>B(e)}),Ws,Gs,Ks,qs,Js,Ys,Xs,Zs,Qs,$s=l(()=>{R(),U(),Z(),Ws=e=>{if(!e||e.length<1)throw Error(`Too few inputs`);if(e[0].dataType!==1&&e[0].dataType!==10)throw Error(`Input type must be float or float16.`);if(e.length>=2){let t=e[0].dims.length*2===e[1].dims[0];if(e.length===4&&(t=e[3].dims[0]*2===e[1].dims[0]),!t)throw Error(`The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].`)}},Gs=(e,t,n)=>{let r=``;for(let i=t-1;i>=0;--i)r+=`
            k = i32(${e.indicesGet(`indices`,i)}) - ${J(`uniforms.pads`,i,n)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${J(`uniforms.x_shape`,i,t)})) {
              break;
            }
            offset += k * i32(${J(`uniforms.x_strides`,i,t)});
        `;return`
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${r}
            value = x[offset];
          }
      `},Ks=(e,t,n)=>{let r=``;for(let i=t-1;i>=0;--i)r+=`
                k = i32(${e.indicesGet(`indices`,i)}) - ${J(`uniforms.pads`,i,n)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${J(`uniforms.x_shape`,i,t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${J(`uniforms.x_shape`,i,t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${J(`uniforms.x_strides`,i,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},qs=(e,t,n)=>{let r=``;for(let i=t-1;i>=0;--i)r+=`
                k = i32(${e.indicesGet(`indices`,i)}) - ${J(`uniforms.pads`,i,n)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${J(`uniforms.x_shape`,i,t)})) {
                  k = i32(${J(`uniforms.x_shape`,i,t)}) - 1;
                }
                offset += k * i32(${J(`uniforms.x_strides`,i,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},Js=(e,t,n)=>{let r=``;for(let i=t-1;i>=0;--i)r+=`
                k = i32(${e.indicesGet(`indices`,i)}) - ${J(`uniforms.pads`,i,n)};
                if (k < 0)  {
                  k += i32(${J(`uniforms.x_shape`,i,t)}]);
                }
                if (k >= i32(${J(`uniforms.x_shape`,i,t)})) {
                  k -= i32(${J(`uniforms.x_shape`,i,t)});
                }
                offset += k * i32(${J(`uniforms.x_strides`,i,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},Ys=(e,t,n)=>{switch(n.mode){case 0:return Gs(e,t,n.pads.length);case 1:return Ks(e,t,n.pads.length);case 2:return qs(e,t,n.pads.length);case 3:return Js(e,t,n.pads.length);default:throw Error(`Invalid mode`)}},Xs=(e,t)=>{let n=H.padShape(e[0].dims.slice(),t.pads),r=e[0].dims,i=[{type:12,data:H.size(n)},{type:6,data:t.pads}],a=e.length>=3&&e[2].data;return t.mode===0&&i.push({type:a?e[2].dataType:1,data:t.value}),i.push(...K(e[0].dims,n)),{name:`Pad`,shaderCache:{hint:`${t.mode}${a}`,inputDependencies:[`rank`]},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(H.size(n)/64)},programUniforms:i}),getShaderSource:i=>{let o=X(`output`,e[0].dataType,n.length),s=Y(`x`,e[0].dataType,r.length),c=s.type.value,l=Ys(o,r.length,t),u=[{name:`output_size`,type:`u32`},{name:`pads`,type:`i32`,length:t.pads.length}];return t.mode===0&&u.push({name:`constant_value`,type:a?c:`f32`}),`
            ${i.registerUniforms(u).declareVariables(s,o)}
            ${i.mainStart()}
            ${i.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}

            let indices = ${o.offsetToIndices(`global_idx`)};

            var value = ${c}(0);
            ${l}
            output[global_idx] = value;
        }`}}},Zs=(e,t)=>{if(e.length>1){let n=e[1].getBigInt64Array(),r=e.length>=3&&e[2].data?e[2].dataType===10?e[2].getUint16Array()[0]:e[2].getFloat32Array()[0]:0,i=e[0].dims.length,a=new Int32Array(2*i).fill(0);if(e.length>=4){let t=e[3].getBigInt64Array();for(let e=0;e<t.length;e++)a[Number(t[e])]=Number(n[e]),a[Number(t[e])+i]=Number(n[e+t.length])}else n.forEach((e,t)=>a[Number(t)]=Number(e));let o=[];return a.forEach(e=>o.push(e)),{mode:t.mode,value:r,pads:o}}else return t},Qs=(e,t)=>{Ws(e.inputs);let n=Zs(e.inputs,t);e.compute(Xs(e.inputs,n),{inputs:[0]})}}),ec,tc,nc,rc,ic,ac,oc,sc,cc,lc,uc,dc,fc,pc,mc,hc,gc,_c,vc,yc=l(()=>{Pe(),R(),U(),Z(),ec=e=>{if(T.webgpu.validateInputContent&&(!e||e.length!==1))throw Error(`Pool ops requires 1 input.`)},tc=(e,t,n)=>{let r=t.format===`NHWC`,i=e.dims.slice();r&&i.splice(1,0,i.pop());let a=Object.hasOwnProperty.call(t,`dilations`),o=t.kernelShape.slice(),s=t.strides.slice(),c=a?t.dilations.slice():[],l=t.pads.slice();Zt.adjustPoolAttributes(n,i,o,s,c,l);let u=Zt.computePoolOutputShape(n,i,s,c,o,l,t.autoPad),d=Object.assign({},t);a?Object.assign(d,{kernelShape:o,strides:s,pads:l,dilations:c,cacheKey:t.cacheKey}):Object.assign(d,{kernelShape:o,strides:s,pads:l,cacheKey:t.cacheKey});let f=u.slice();return f.push(f.splice(1,1)[0]),[d,r?f:u]},nc=(e,t)=>{let n=t.format===`NHWC`,r=H.size(e),i=H.size(t.kernelShape),a=[{type:12,data:r},{type:12,data:i}],o=[{name:`outputSize`,type:`u32`},{name:`kernelSize`,type:`u32`}];if(t.kernelShape.length<=2){let e=t.kernelShape[t.kernelShape.length-1],n=t.strides[t.strides.length-1],r=t.pads[t.pads.length/2-1],i=t.pads[t.pads.length-1],s=!!(r+i);a.push({type:12,data:e},{type:12,data:n},{type:12,data:r},{type:12,data:i}),o.push({name:`kw`,type:`u32`},{name:`sw`,type:`u32`},{name:`pwStart`,type:`u32`},{name:`pwEnd`,type:`u32`});let c=!1;if(t.kernelShape.length===2){let e=t.kernelShape[t.kernelShape.length-2],n=t.strides[t.strides.length-2],r=t.pads[t.pads.length/2-2],i=t.pads[t.pads.length-2];c=!!(r+i),a.push({type:12,data:e},{type:12,data:n},{type:12,data:r},{type:12,data:i}),o.push({name:`kh`,type:`u32`},{name:`sh`,type:`u32`},{name:`phStart`,type:`u32`},{name:`phEnd`,type:`u32`})}return[a,o,!0,s,c]}else{if(n)throw Error(`Pooling with kernelShape.length > 2 is not supported for NHWC format.`);let e=H.computeStrides(t.kernelShape);return a.push({type:12,data:e},{type:12,data:t.pads},{type:12,data:t.strides}),o.push({name:`kernelStrides`,type:`u32`,length:e.length},{name:`pads`,type:`u32`,length:t.pads.length},{name:`strides`,type:`u32`,length:t.strides.length}),[a,o,!!t.pads.reduce((e,t)=>e+t),!1,!1]}},rc=(e,t,n,r,i,a,o,s,c,l,u,d)=>{let f=i.format===`NHWC`,p=t.type.value,m=X(`output`,t.type.tensor,r);if(i.kernelShape.length<=2){let r=``,l=``,h=``,g=n-(f?2:1);if(r=u?`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${g}] < 0 || xIndices[${g}]
                      >= uniforms.x_shape[${g}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset(`xIndices`)}];
                  ${a}
                }`:`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset(`xIndices`)}];
                  ${a}
                }`,i.kernelShape.length===2){let e=n-(f?3:2);l=d?`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${e}] = indices[${e}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${e}] < 0 || xIndices[${e}] >= uniforms.x_shape[${e}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${e}] = indices[${e}] * uniforms.sh - uniforms.phStart + j;
                `,h=`
              }
            `}return`
            ${e.registerUniforms(c).declareVariables(t,m)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}

              let indices = ${m.offsetToIndices(`global_idx`)};
              var xIndices = ${m.offsetToIndices(`global_idx`)};

              var value = ${p}(${s});
              var pad = 0;
              ${l}
              ${r}
              ${h}
              ${o}

              output[global_idx] = value;
            }`}else{if(f)throw Error(`Pooling with kernelShape.length > 2 is not supported for NHWC format.`);let r=i.kernelShape.length,u=i.pads.length,d=``;return d=l?`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset(`xIndices`)}];
                ${a}
              }`:`
              }
              let x_val = x[${t.indicesToOffset(`xIndices`)}];
              ${a}
            `,`
            ${e.registerUniforms(c).declareVariables(t,m)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
              let indices = ${m.offsetToIndices(`global_idx`)};
              var xIndices = ${m.offsetToIndices(`global_idx`)};

              var offsets: array<u32, ${r}>;

              var value = ${p}(${s});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${r-1}u; j++) {
                  offsets[j] = offset / ${J(`uniforms.kernelStrides`,`j`,r)};
                  offset -= offsets[j] * ${J(`uniforms.kernelStrides`,`j`,r)};
                }
                offsets[${r-1}] = offset;

                isPad = false;
                for (var j = ${n-r}u; j < ${n}u; j++) {
                  xIndices[j] = indices[j] * ${J(`uniforms.strides`,`j - ${n-r}u`,r)}
                    + offsets[j - ${n-r}u] - ${J(`uniforms.pads`,`j - 2u`,u)};
                  ${d}
              }
              ${o}

              output[global_idx] = value;
            }`}},ic=e=>`${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`,ac=e=>`${ic(e)};${e.countIncludePad}`,oc=e=>`${ic(e)};${e.storageOrder};${e.dilations}`,sc=e=>({format:e.format,autoPad:[`NOTSET`,`VALID`,`SAME_UPPER`,`SAME_LOWER`][e.auto_pad],ceilMode:e.ceil_mode,kernelShape:e.kernel_shape,strides:e.strides,pads:e.pads}),cc=(e,t,n,r)=>{let[i,a]=tc(t,r,n),o=Y(`x`,t.dataType,t.dims.length),s=o.type.value,c=``;i.countIncludePad?c+=`value /= ${s}(uniforms.kernelSize);`:c+=`value /= ${s}(i32(uniforms.kernelSize) - pad);`;let[l,u,d,f,p]=nc(a,i);return l.push(...K(t.dims,a)),{name:e,shaderCache:{hint:`${r.cacheKey};${d};${f};${p}`,inputDependencies:[`rank`]},getRunData:()=>({outputs:[{dims:a,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(H.size(a)/64)},programUniforms:l}),getShaderSource:e=>rc(e,o,t.dims.length,a.length,i,`value += x_val;`,c,0,u,d,f,p)}},lc=e=>{let t=e.count_include_pad!==0,n=sc(e);if(n.ceilMode!==0)throw Error(`using ceil() in shape computation is not yet supported for AveragePool`);let r={countIncludePad:t,...n,cacheKey:``};return{...r,cacheKey:ac(r)}},uc=(e,t)=>{ec(e.inputs),e.compute(cc(`AveragePool`,e.inputs[0],!1,t))},dc={autoPad:``,ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},fc=e=>{let t=e.format;return{format:t,...dc,cacheKey:t}},pc=(e,t)=>{ec(e.inputs),e.compute(cc(`GlobalAveragePool`,e.inputs[0],!0,t))},mc=(e,t,n,r)=>{let[i,a]=tc(t,r,n),o=Y(`x`,t.dataType,t.dims.length),s=[`rank`],[c,l,u,d,f]=nc(a,i);return c.push(...K(t.dims,a)),{name:e,shaderCache:{hint:`${r.cacheKey};${u};${d};${f}`,inputDependencies:s},getRunData:()=>({outputs:[{dims:a,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(H.size(a)/64)},programUniforms:c}),getShaderSource:e=>rc(e,o,t.dims.length,a.length,i,`
      value = max(x_val, value);
    `,``,t.dataType===10?-65504:-1e5,l,u,d,f)}},hc=(e,t)=>{ec(e.inputs),e.compute(mc(`MaxPool`,e.inputs[0],!1,t))},gc=e=>{let t=e.storage_order,n=e.dilations,r=sc(e);if(t!==0)throw Error(`column major storage order is not yet supported for MaxPool`);if(r.ceilMode!==0)throw Error(`using ceil() in shape computation is not yet supported for MaxPool`);let i={storageOrder:t,dilations:n,...r,cacheKey:``};return{...i,cacheKey:oc(i)}},_c=e=>{let t=e.format;return{format:t,...dc,cacheKey:t}},vc=(e,t)=>{ec(e.inputs),e.compute(mc(`GlobalMaxPool`,e.inputs[0],!0,t))}}),bc,xc,Sc,Cc,wc=l(()=>{R(),U(),V(),Z(),bc=(e,t)=>{if(e.length<2||e.length>3)throw Error(`DequantizeLinear requires 2 or 3 inputs.`);if(e.length===3&&e[1].dims===e[2].dims)throw Error(`x-scale and x-zero-point must have the same shape.`);if(e.length===3&&e[0].dataType!==e[2].dataType)throw Error(`x and x-zero-point must have the same data type.`);if(e[0].dataType===6&&e.length>2)throw Error(`In the case of dequantizing int32 there is no zero point.`);if(e[1].dims.length!==0&&e[1].dims.length!==1&&e[1].dims.length!==e[0].dims.length)throw Error(`scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.`);if(e.length>2){if(e[0].dataType!==e[2].dataType)throw Error(`x and x-zero-point must have the same data type.`);if(e[1].dims.length!==e[2].dims.length)throw Error(`scale and zero-point inputs must have the same rank.`);if(!e[1].dims.map((t,n)=>t===e[2].dims[n]).reduce((e,t)=>e&&t,!0))throw Error(`scale and zero-point inputs must have the same shape.`)}if(t.blockSize>0){if(e[1].dims.length===0||e[1].dims.length===1&&e[1].dims[0]===1)throw Error(`blockSize must be set only for block quantization.`);if(!e[1].dims.map((n,r)=>r===t.axis||n===e[0].dims[r]).reduce((e,t)=>e&&t,!0))throw Error(`For block qunatization, scale input shape to match the input shape except for the axis`);if(e[1].dims.length!==e[0].dims.length)throw Error(`For block qunatization the scale input rank must be the same as the x rank.`);let n=e[0].dims[t.axis],r=e[1].dims[t.axis];if(t.blockSize<Math.ceil(n/r)||t.blockSize>Math.ceil(n/(r-1)-1))throw Error(`blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].`)}},xc=(e,t)=>{let n=H.normalizeAxis(t.axis,e[0].dims.length),r=e[0].dataType,i=r===3,a=e[0].dims,o=e[1].dataType,s=H.size(a),c=r===3||r===2,l=c?[Math.ceil(H.size(e[0].dims)/4)]:e[0].dims,u=e[1].dims,d=e.length>2?e[2]:void 0,f=d?c?[Math.ceil(H.size(d.dims)/4)]:d.dims:void 0,p=u.length===0||u.length===1&&u[0]===1,m=p===!1&&u.length===1,h=q(s),g=p&&(!c||h===4),_=g?h:1,v=g&&!c?h:1,y=Y(`input`,c?12:r,l.length,v),b=Y(`scale`,o,u.length),x=d?Y(`zero_point`,c?12:r,f.length):void 0,S=X(`output`,o,a.length,_),C=[y,b];x&&C.push(x);let w=[l,u];d&&w.push(f);let T=[{type:12,data:s/_},{type:12,data:n},{type:12,data:t.blockSize},...K(...w,a)];return{name:`DequantizeLinear`,shaderCache:{hint:t.cacheKey,inputDependencies:x?[`rank`,`rank`,`rank`]:[`rank`,`rank`]},getShaderSource:e=>`
      ${e.registerUniforms([{name:`output_size`,type:`u32`},{name:`axis`,type:`u32`},{name:`block_size`,type:`u32`}]).declareVariables(...C,S)}
      ${e.mainStart()}
          ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
          let output_indices = ${S.offsetToIndices(`global_idx`)};

          // Set input x
          ${c?`
            let input = ${y.getByOffset(`global_idx / 4`)};
            let x_vec = ${i?`unpack4xI8(input)`:`unpack4xU8(input)`};
            let x_value = ${_===1?`x_vec[global_idx % 4]`:`x_vec`};`:`let x_value = ${y.getByOffset(`global_idx`)};`};

          // Set scale input
          ${p?`let scale_value= ${b.getByOffset(`0`)}`:m?`
            let scale_index = ${S.indicesGet(`output_indices`,`uniforms.axis`)};
            let scale_value= ${b.getByOffset(`scale_index`)};`:`
            var scale_indices: ${b.type.indices} = output_indices;
            let index = ${b.indicesGet(`scale_indices`,`uniforms.axis`)} / uniforms.block_size;
            ${b.indicesSet(`scale_indices`,`uniforms.axis`,`index`)};
            let scale_value= ${b.getByIndices(`scale_indices`)};`};

          // Set zero-point input
          ${x?p?c?`
                let zero_point_input = ${x.getByOffset(`0`)};
                let zero_point_vec =  ${i?`unpack4xI8(zero_point_input)`:`unpack4xU8(zero_point_input)`};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${x.getByOffset(`0`)}`:m?c?`
                let zero_point_index = ${S.indicesGet(`output_indices`,`uniforms.axis`)};
                let zero_point_input = ${x.getByOffset(`zero_point_index / 4`)};
                let zero_point_vec =  ${i?`unpack4xI8(zero_point_input)`:`unpack4xU8(zero_point_input)`};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${S.indicesGet(`output_indices`,`uniforms.axis`)};
                let zero_point_value = ${x.getByOffset(`zero_point_index`)};`:c?`
                let zero_point_offset = ${b.indicesToOffset(`scale_indices`)};
                let zero_point_input = ${x.getByOffset(`zero_point_offset / 4`)};
                let zero_point_vec = ${i?`unpack4xI8(zero_point_input)`:`unpack4xU8(zero_point_input)`};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${x.getByIndices(`scale_indices`)};`:`let zero_point_value = ${c?i?`i32`:`u32`:y.type.value}(0);`};
      // Compute and write output
      ${S.setByOffset(`global_idx`,`${S.type.value}(x_value - zero_point_value) * scale_value`)};
      }`,getRunData:()=>({outputs:[{dims:a,dataType:o}],dispatchGroup:{x:Math.ceil(s/_/64),y:1,z:1},programUniforms:T})}},Sc=(e,t)=>{bc(e.inputs,t),e.compute(xc(e.inputs,t))},Cc=e=>B({axis:e.axis,blockSize:e.blockSize})}),Tc,Ec,Dc,Oc=l(()=>{Pe(),R(),Z(),Tc=(e,t,n)=>{if(e===t||e<t&&n<0||e>t&&n>0)throw Error(`Range these inputs' contents are invalid.`)},Ec=(e,t,n,r)=>{let i=Math.abs(Math.ceil((t-e)/n)),a=[i],o=i,s=[{type:12,data:o},{type:r,data:e},{type:r,data:n},...K(a)];return{name:`Range`,shaderCache:{hint:`${r}`},getShaderSource:e=>{let t=X(`output`,r,a.length),n=t.type.value,i=[{name:`outputSize`,type:`u32`},{name:`start`,type:n},{name:`delta`,type:n}];return`
        ${e.registerUniforms(i).declareVariables(t)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
        output[global_idx] = uniforms.start + ${n}(global_idx) * uniforms.delta;
      }`},getRunData:()=>({outputs:[{dims:a,dataType:r}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:s})}},Dc=e=>{let t=0,n=0,r=0;e.inputs[0].dataType===6?(t=e.inputs[0].getInt32Array()[0],n=e.inputs[1].getInt32Array()[0],r=e.inputs[2].getInt32Array()[0]):e.inputs[0].dataType===1&&(t=e.inputs[0].getFloat32Array()[0],n=e.inputs[1].getFloat32Array()[0],r=e.inputs[2].getFloat32Array()[0]),T.webgpu.validateInputContent&&Tc(t,n,r),e.compute(Ec(t,n,r,e.inputs[0].dataType),{inputs:[]})}}),kc,Ac,jc,Mc,Nc,Pc,Fc,Ic,Lc,Rc,zc,Bc,Vc,Hc,Uc,Wc,Gc,Kc,qc,Jc=l(()=>{R(),U(),V(),Z(),kc=(e,t)=>{if(e.every(e=>e>0||(()=>{throw Error(`Resize requires scales input values to be positive`)})),e.length>0){if(t.mode===`linear`){if(!(e.length===2||e.length===3||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1||e.length===5&&e[0]===1&&e[1]===1))throw Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(t.mode===`cubic`&&!(e.length===2||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1))throw Error(`Resize requires scales input size to be 2 or 4 for cubic mode`)}},Ac=(e,t,n)=>{t.every(e=>e>=0&&e<n||(()=>{throw Error(`Resize requires axes input values to be positive and less than rank`)}));let r=Array(n).fill(1);return t.forEach((t,n)=>r[t]=e[n]),r},jc=(e,t,n,r,i,a)=>{let[o,s,c]=n>10?[1,2,3]:[-1,e.length>1?1:-1,-1],l=e[0].dims.length;if(o>0&&e.length>o&&e[o].dims.length>0)e[o].getFloat32Array().forEach(e=>a.push(e));else if(t.coordinateTransformMode===`tf_crop_and_resize`)throw Error(`Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize`);if(s>0&&e.length>s&&e[s].dims.length===1&&e[s].dims[0]>0){if(e[s].getFloat32Array().forEach(e=>r.push(e)),r.length!==0&&r.length!==l&&n>=18&&r.length!==t.axes.length)throw Error(`Resize requires scales input size to be same as input rank or axes size for opset 18 and up`);kc(r,t),t.axes.length>0&&Ac(r,t.axes,l).forEach((e,t)=>r[t]=e)}if(c>0&&e.length>c&&e[c].dims.length===1&&e[c].dims[0]>0&&(e[c].getBigInt64Array().forEach(e=>i.push(Number(e))),i.length!==0&&i.length!==l&&n>=18&&i.length!==t.axes.length))throw Error(`Resize requires sizes input size to be same as input rank or axes size for opset 18 and up`);if(t.axes.length>0){if(r.length!==0&&r.length!==t.axes.length)throw Error(`Resize requires "scales" input size to be of axes rank when axes attributes is specified`);if(i.length!==0&&i.length!==t.axes.length)throw Error(`Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified`)}if(typeof r<`u`&&typeof i<`u`&&r.length>0&&i.length>l)throw Error(`Resize requires only of scales or sizes to be specified`)},Mc=(e,t)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { `+(()=>{switch(e){case`asymmetric`:return`return ${t}(xResized) / ${t}(xScale);`;case`pytorch_half_pixel`:return`if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case`tf_half_pixel_for_nn`:return`return (${t}(xResized) + 0.5) / ${t}(xScale);`;case`align_corners`:return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    // The whole part and the fractional part are calculated separately due to inaccuracy of floating
                    // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
                    // offset-by-one error later in floor().
                    let whole = ${t}(xResized * (lengthOriginal - 1) / (lengthResized - 1));
                    let fract =
                        ${t}(xResized * (lengthOriginal - 1) % (lengthResized - 1)) / ${t}(lengthResized - 1);
                    return whole + fract;
                  }`;case`tf_crop_and_resize`:return`if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;case`half_pixel_symmetric`:return`const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;case`half_pixel`:return`return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;default:throw Error(`Coordinate transform mode ${e} is not supported`)}})()+`}`,Nc=(e,t,n)=>`fn getNearestPixelFromOriginal(xOriginal: ${n}, isDownSample: bool) -> ${n} {`+(()=>{switch(e){case`round_prefer_ceil`:return`if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }`;case`floor`:return`return floor(xOriginal);`;case`ceil`:return`return ceil(xOriginal);`;case`round_prefer_floor`:return`if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }`;default:if(t<11)return`if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }`;throw Error(`Nearest mode ${e} is not supported`)}})()+`}`,Pc=(e,t,n)=>{let r=Array(n).fill(0).concat(Array(n).fill(1)),i=e.length===0?r:e.slice();return t.length>0?(t.forEach((e,a)=>{r[e]=i[a],r[a+n]=i[t.length+a]}),r):i},Fc=(e,t,n,r)=>{let i=[];if(n.length>0)if(r.length>0){if(e.forEach(e=>i.push(e)),Math.max(...r)>e.length)throw Error(`axes is out of bound`);r.forEach((e,t)=>i[e]=n[t])}else n.forEach(e=>i.push(e));else{if(t.length===0)throw Error(`Resize requires either scales or sizes.`);i=e.map((e,n)=>Math.round(e*t[n]))}return i},Ic=(e,t,n)=>{let r=(()=>{switch(n.keepAspectRatioPolicy){case`not_larger`:return n.axes.length>0?Math.min(...n.axes.map(e=>t[e]),Number.MAX_VALUE):Math.min(...t,Number.MAX_VALUE);case`not_smaller`:return n.axes.length>0?Math.max(...n.axes.map(e=>t[e]),Number.MIN_VALUE):Math.max(...t,Number.MIN_VALUE);default:throw Error(`Keep aspect ratio policy ${n.keepAspectRatioPolicy} is not supported`)}})();t.fill(1,0,t.length);let i=e.slice();return n.axes.length>0?(n.axes.forEach(e=>t[e]=r),n.axes.forEach(n=>i[n]=Math.round(e[n]*t[n]))):(t.fill(r,0,t.length),i.forEach((e,n)=>i[n]=Math.round(e*t[n]))),i},Lc=(e,t,n,r,i)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${n.length}> {
      var original_indices: array<${e.type.value}, ${n.length}>;
      for (var i:u32 = 0; i < ${n.length}; i++) {
        var output_index = ${e.indicesGet(`output_indices`,`i`)};
        var scale = ${J(`uniforms.scales`,`i`,r)};
        var roi_low = ${J(`uniforms.roi`,`i`,i)};
        var roi_hi = ${J(`uniforms.roi`,`i + ${t.length}`,i)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${J(`uniforms.input_shape`,`i`,t.length)};
          var output_shape_i = ${J(`uniforms.output_shape`,`i`,n.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,Rc=(e,t,n,r,i,a,o)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${t.indicesGet(`output_indices`,`i`)};
        var input_index: u32;
        var scale = ${J(`uniforms.scales`,`i`,i)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${J(`uniforms.roi`,`i`,a)};
          var roi_hi = ${J(`uniforms.roi`,`i + ${n.length}`,a)};
          var input_shape_i = ${J(`uniforms.input_shape`,`i`,n.length)};
          var output_shape_i = ${J(`uniforms.output_shape`,`i`,r.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${o} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet(`input_indices`,`i`,` input_index`)}
      }
      return input_indices;
    }`,zc=(e,t)=>`
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet(`input_indices`,`i`)};
        if (input_index < 0 || input_index >= ${J(`uniforms.input_shape`,`i`,t.length)}) {
          return false;
        }
      }
      return true;
    }`,Bc=(e,t,n,r)=>e.rank>r?`
    ${e.indicesSet(`input_indices`,t,`channel`)};
    ${e.indicesSet(`input_indices`,n,`batch`)};
`:``,Vc=(e,t,n,r,i)=>{let[a,o,s,c]=n.length===2?[-1,0,1,-1]:[0,2,3,1],l=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${l} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet(`input_indices`,o,`max(0, min(row, ${n[o]} - 1))`)};
      ${e.indicesSet(`input_indices`,s,`max(0, min(col, ${n[s]} - 1))`)};
      ${Bc(e,c,a,2)}
      return ${e.getByIndices(`input_indices`)};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${l} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${l} = originalIndices[${o}];
      var col:${l} = originalIndices[${s}];
      ${r?`if (row < 0 || row > (${n[o]} - 1) || col < 0 || col > (${n[s]} - 1)) {
        return ${i};
      }`:``};
      row = max(0, min(row, ${n[o]} - 1));
      col = max(0, min(col, ${n[s]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${n.length>2?`u32(originalIndices[${c}])`:`0`};
      var batch: u32 =  ${n.length>2?`u32(originalIndices[${a}])`:`0`};
      var x11: ${l} = getInputValue(batch, channel, row1, col1);
      var x12: ${l} = getInputValue(batch, channel, row1, col2);
      var x21: ${l} = getInputValue(batch, channel, row2, col1);
      var x22: ${l} = getInputValue(batch, channel, row2, col2);
      var dx1: ${l} = abs(row - ${l}(row1));
      var dx2: ${l} = abs(${l}(row2) - row);
      var dy1: ${l} = abs(col - ${l}(col1));
      var dy2: ${l} = abs(${l}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},Hc=(e,t,n,r,i,a,o,s,c,l)=>{let[u,d]=n.length===2?[0,1]:[2,3],f=e.type.value,p=o=>{let d=o===u?`row`:`col`;return`
      fn ${d}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${f} {
        var output_index = ${t.indicesGet(`output_indices`,o)};
        var originalIdx: ${f} = getOriginalCoordinateFromResizedCoordinate(output_index, ${i[o]},
        ${r[o]}, ${n[o]}, ${a[o]}, ${a[o]} + ${n.length});
        var fractOriginalIdx: ${f} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${s} && (originalIdx < 0 || originalIdx > (${n[o]} - 1))) {
          return ${c};
        }
        var data: array<${f}, 4> = array<${f}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${d}: ${f} = originalIdx + ${f}(i);
          if (${d} < 0 || ${d} >= ${n[o]}) {
            ${l?`coefs[i + 1] = 0.0;
                        continue;`:s?`return ${c};`:`${d} = max(0, min(${d}, ${n[o]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet(`input_indices_copy`,o,`u32(${d})`)};
          data[i + 1] = ${o===u?e.getByIndices(`input_indices_copy`):`rowCubicInterpolation(input_indices_copy, output_indices)`};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${p(u)};
    ${p(d)};
  fn getCubicInterpolationCoefs(s: ${f}) -> array<${f}, 4> {
    var absS = abs(s);
    var coeffs: array<${f}, 4> = array<${f}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${f} = 1.0 - absS;
    var twoMinusAbsS: ${f} = 2.0 - absS;
    var onePlusAbsS: ${f} = 1.0 + absS;
    coeffs[0] = ((${o} * onePlusAbsS - 5 * ${o}) * onePlusAbsS + 8 * ${o}) * onePlusAbsS - 4 * ${o};
    coeffs[1] = ((${o} + 2) * absS - (${o} + 3)) * absS * absS + 1;
    coeffs[2] = ((${o} + 2) * oneMinusAbsS - (${o} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${o} * twoMinusAbsS - 5 * ${o}) * twoMinusAbsS + 8 * ${o}) * twoMinusAbsS - 4 * ${o};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${f}, 4>, coefs: array<${f}, 4>) -> ${f} {
    var coefsSum: ${f} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${f} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},Uc=(e,t,n,r,i)=>{let[a,o,s,c,l]=n.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],u=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${u} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet(`input_indices`,o,`max(0, min(depth, ${n[o]} - 1))`)};
      ${e.indicesSet(`input_indices`,s,`max(0, min(height, ${n[s]} - 1))`)};
      ${e.indicesSet(`input_indices`,c,`max(0, min(width, ${n[c]} - 1))`)};
      ${Bc(e,l,a,3)}
      return ${e.getByIndices(`input_indices`)};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${u} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${u} = originalIndices[${o}];
      var height:${u} = originalIndices[${s}];
      var width:${u} = originalIndices[${c}];
      ${r?`if (depth < 0 || depth > (${n[o]} - 1) || height < 0 || height > (${n[s]} - 1) || width < 0 || (width > ${n[c]} - 1)) {
      return ${i};
        }`:``};

    depth = max(0, min(depth, ${n[o]} - 1));
      height = max(0, min(height, ${n[s]} - 1));
      width = max(0, min(width, ${n[c]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${n.length>3?`u32(originalIndices[${l}])`:`0`};
      var batch: u32 =  ${n.length>3?`u32(originalIndices[${a}])`:`0`};

      var x111: ${u} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${u} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${u} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${u} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${u} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${u} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${u} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${u} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${u} = abs(depth - ${u}(depth1));
      var dx2: ${u} = abs(${u}(depth2) - depth);
      var dy1: ${u} = abs(height - ${u}(height1));
      var dy2: ${u} = abs(${u}(height2) - height);
      var dz1: ${u} = abs(width - ${u}(width1));
      var dz2: ${u} = abs(${u}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},Wc=(e,t,n,r,i,a)=>{let o=e.dims,s=Pc(a,t.axes,o.length),c=Fc(o,r,i,t.axes),l=r.slice();r.length===0&&(l=o.map((e,t)=>e===0?1:c[t]/e),t.keepAspectRatioPolicy!==`stretch`&&(c=Ic(o,l,t)));let u=X(`output`,e.dataType,c.length),d=Y(`input`,e.dataType,o.length),f=H.size(c),p=o.length===c.length&&o.every((e,t)=>e===c[t]),m=t.coordinateTransformMode===`tf_crop_and_resize`,h=t.extrapolationValue,g=d.type.value;return{name:`Resize`,shaderCache:{hint:`${t.cacheKey}|${n}|${l.length>0?l:``}|${i.length>0?i:``}|${s.length>0?s:``}|${p}|${o}`,inputDependencies:[`rank`]},getShaderSource:e=>`
      ${p?``:`
      ${Mc(t.coordinateTransformMode,g)};
      ${(()=>{switch(t.mode){case`nearest`:return`
              ${zc(d,o)};
              ${Nc(t.nearestMode,n,g)};
              ${Rc(d,u,o,c,l.length,s.length,m)};
              `;case`linear`:return`
              ${Lc(u,o,c,l.length,s.length)};
              ${(()=>{if(o.length===2||o.length===4)return`${Vc(d,u,o,m,h)}`;if(o.length===3||o.length===5)return`${Uc(d,u,o,m,h)}`;throw Error(`Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.`)})()};
            `;case`cubic`:return`
            ${(()=>{if(o.length===2||o.length===4)return`${Hc(d,u,o,c,l,s,t.cubicCoeffA,m,t.extrapolationValue,t.excludeOutside)}`;throw Error(`Cubic mode only supports input dims 2 and 4 are supported in linear mode.`)})()};
            `;default:throw Error(`Invalid resize mode`)}})()};
      `}
      ${e.registerUniform(`output_size`,`u32`).registerUniform(`scales`,`f32`,l.length).registerUniform(`roi`,`f32`,s.length).declareVariables(d,u)}
      ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.output_size`)}
        ${p?`output[global_idx] = input[global_idx];`:`
        let output_indices = ${u.offsetToIndices(`global_idx`)};
        var input_indices: ${d.type.indices};
        ${(()=>{switch(t.mode){case`nearest`:return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${d.getByIndices(`input_indices`)};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;case`linear`:return`output[global_idx] = ${o.length===2||o.length===4?`bilinearInterpolation`:`trilinearInterpolation`}(output_indices);`;case`cubic`:return`output[global_idx] = bicubicInterpolation(output_indices);`;default:throw Error(`Unsupported resize mode: ${t.mode}`)}})()};
`}
      }`,getRunData:()=>({outputs:[{dims:c,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:[{type:12,data:f},{type:1,data:l},{type:1,data:s},...K(o,c)]})}},Gc=e=>{let t=e.customDataBuffer;return new Uint32Array(t,t.byteOffset,1)[0]},Kc=(e,t)=>{let n=[],r=[],i=[],a=Gc(e);if(t.antialias!==0)throw Error(`Only default value (0) for Antialias attribute is supported`);jc(e.inputs,t,a,n,r,i),e.compute(Wc(e.inputs[0],t,a,n,r,i),{inputs:[0]})},qc=e=>{let t=e.antialias,n=e.axes,r=e.coordinateTransformMode,i=e.cubicCoeffA,a=e.excludeOutside!==0,o=e.extrapolationValue,s=e.keepAspectRatioPolicy,c=e.mode,l=e.nearestMode===``?`simple`:e.nearestMode;return B({antialias:t,axes:n,coordinateTransformMode:r,cubicCoeffA:i,excludeOutside:a,extrapolationValue:o,keepAspectRatioPolicy:s,mode:c,nearestMode:l})}}),Yc,Xc,Zc,Qc=l(()=>{R(),U(),V(),Z(),Yc=(e,t)=>{let[n,r,i,a]=e,{numHeads:o,rotaryEmbeddingDim:s}=t;if(n.dims.length!==3&&n.dims.length!==4)throw Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${n.dims.length}`);if(!H.areEqual(r.dims,[])&&!H.areEqual(r.dims,[1])&&r.dims.length!==2)throw Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${r.dims.length}`);if(i.dims.length!==2)throw Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${i.dims.length}`);if(a.dims.length!==2)throw Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${a.dims.length}`);if(!H.areEqual(i.dims,a.dims))throw Error(`Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape`);if(s>0&&o===0)throw Error(`num_heads must be provided if rotary_embedding_dim is specified`);let c=n.dims[0],l=n.dims[n.dims.length-2],u=i.dims[0],d=H.sizeFromDimension(n.dims,1)/l,f=s===0?i.dims[1]*2:d/o;if(s>f)throw Error(`rotary_embedding_dim must be less than or equal to head_size`);if(r.dims.length===2){if(c!==r.dims[0])throw Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${r.dims[0]}`);if(l!==r.dims[1])throw Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${r.dims[1]}`)}if(f/2!==i.dims[1]&&s/2!==i.dims[1])throw Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${i.dims[1]}`);if(l>u)throw Error(`Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported`)},Xc=(e,t)=>{let{interleaved:n,numHeads:r,rotaryEmbeddingDim:i,scale:a}=t,o=e[0].dims[0],s=H.sizeFromDimension(e[0].dims,1),c=e[0].dims[e[0].dims.length-2],l=s/c,u=e[2].dims[1],d=i===0?u*2:l/r,f=[o,c,l/d,d-u],p=H.computeStrides(f),m=[{type:1,data:a},{type:12,data:f},{type:12,data:p},...e[0].dims.length===3?Array({type:12,data:[s,l,d,1]}):[],...e[0].dims.length===4?Array({type:12,data:[s,d,c*d,1]}):[],...K(e[0].dims,e[1].dims,e[2].dims,e[3].dims,e[0].dims)];return{name:`RotaryEmbedding`,shaderCache:{hint:B({interleaved:n}).cacheKey,inputDependencies:[`rank`,`rank`,`rank`,`rank`]},getShaderSource:t=>{let r=Y(`input`,e[0].dataType,e[0].dims.length),i=Y(`position_ids`,e[1].dataType,e[1].dims.length),a=Y(`cos_cache`,e[2].dataType,e[2].dims.length),o=Y(`sin_cache`,e[3].dataType,e[3].dims.length),s=X(`output`,e[0].dataType,e[0].dims.length);return t.registerUniforms([{name:`scale`,type:`f32`},{name:`global_shape`,type:`u32`,length:f.length},{name:`global_strides`,type:`u32`,length:p.length},{name:`input_output_strides`,type:`u32`,length:p.length}]),`
        ${t.declareVariables(r,i,a,o,s)}

        ${t.mainStart(tn)}
          let half_rotary_emb_dim = uniforms.${a.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${t.guardAgainstOutOfBoundsWorkgroupSizes(`size`)}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${i.broadcastedIndicesToOffset(`bsnh.xy`,X(``,i.type.tensor,2))};
            let position_id =
                u32(${i.getByOffset(`position_ids_idx`)}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${n});
            let j = i + select(half_rotary_emb_dim, 1, ${n});
            let re = ${r.getByOffset(`i`)} * ${a.get(`position_id`,`bsnh[3]`)} -
                ${r.getByOffset(`j`)} * ${o.get(`position_id`,`bsnh[3]`)};
            ${s.setByOffset(`i`,`re`)}
            let im = ${r.getByOffset(`i`)} * ${o.get(`position_id`,`bsnh[3]`)} +
                ${r.getByOffset(`j`)} * ${a.get(`position_id`,`bsnh[3]`)};
            ${s.setByOffset(`j`,`im`)}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${s.setByOffset(`k`,r.getByOffset(`k`))}
          }
        }`},getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(H.size(f)/tn)},programUniforms:m})}},Zc=(e,t)=>{Yc(e.inputs,t),e.compute(Xc(e.inputs,t))}}),$c,el,tl,nl=l(()=>{R(),U(),Z(),$c=e=>{if(!e||e.length<3)throw Error(`layerNorm requires at least 3 inputs.`);let t=e[0],n=e[1],r=e[2];if(t.dataType!==n.dataType||t.dataType!==r.dataType)throw Error(`All inputs must have the same data type`);if(t.dims.length!==3&&t.dims.length!==2)throw Error(`Input must be 2D or 3D`);if(n.dims.length!==3&&n.dims.length!==2)throw Error(`Skip must be 2D or 3D`);let i=t.dims[t.dims.length-1],a=t.dims[t.dims.length-2];if(n.dims[n.dims.length-1]!==i)throw Error(`Skip must have the same hidden size as input`);if(n.dims[n.dims.length-2]!==a)throw Error(`Skip must have the same sequence length as input`);if(r.dims.length!==1)throw Error(`Gamma must be 1D`);if(r.dims[r.dims.length-1]!==i)throw Error(`Gamma must have the same hidden size as input`);if(e.length>3){let t=e[3];if(t.dims.length!==1)throw Error(`Beta must be 1D`);if(t.dims[t.dims.length-1]!==i)throw Error(`Beta must have the same hidden size as input`)}if(e.length>4){let t=e[4];if(t.dims.length!==1)throw Error(`Bias must be 1D`);if(t.dims[t.dims.length-1]!==i)throw Error(`Bias must have the same hidden size as input`)}},el=(e,t,n,r)=>{let i=t.simplified,a=e[0].dims,o=H.size(a),s=a,c=o,l=a.slice(-1)[0],u=r?a.slice(0,-1).concat(1):[],d=!i&&e.length>3,f=e.length>4,p=r&&n>1,m=r&&n>2,h=n>3,g=q(l),_=[{type:12,data:c},{type:12,data:g},{type:12,data:l},{type:1,data:t.epsilon}],v=t=>{let n=[{name:`output_size`,type:`u32`},{name:`components`,type:`u32`},{name:`hidden_size`,type:`u32`},{name:`epsilon`,type:`f32`}],r=[Y(`x`,e[0].dataType,e[0].dims,g),Y(`skip`,e[1].dataType,e[1].dims,g),Y(`gamma`,e[2].dataType,e[2].dims,g)];d&&r.push(Y(`beta`,e[3].dataType,e[3].dims,g)),f&&r.push(Y(`bias`,e[4].dataType,e[4].dims,g)),r.push(X(`output`,e[0].dataType,s,g)),p&&r.push(X(`mean_output`,1,u)),m&&r.push(X(`inv_std_output`,1,u)),h&&r.push(X(`input_skip_bias_sum`,e[0].dataType,s,g));let a=W(e[0].dataType),o=W(1,g);return`

      ${t.registerUniforms(n).declareVariables(...r)}
      var<workgroup> sum_shared : array<${o}, 64>;
      var<workgroup> sum_squared_shared : array<${o}, 64>;

      ${t.mainStart([64,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / 64;

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / 64;
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == 63) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${f?`bias[offset1d + i]`:a+`(0.0)`};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${h?`input_skip_bias_sum[offset + i] = value;`:``}
          output[offset + i] = value;
          let f32_value = ${an(a,g,`value`)};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = 64;
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${on(`sum`,g)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${on(`square_sum`,g)} / f32(uniforms.hidden_size) ${i?``:`- mean * mean`} + uniforms.epsilon);
        ${p?`mean_output[global_idx] = mean;`:``}
        ${m?`inv_std_output[global_idx] = inv_std_dev;`:``}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${i?``:`- ${a}(mean)`}) *
            ${a}(inv_std_dev) * gamma[offset1d + i]
            ${d?`+ beta[offset1d + i]`:``};
        }
      }`},y=[{dims:s,dataType:e[0].dataType}];return n>1&&y.push({dims:u,dataType:1}),n>2&&y.push({dims:u,dataType:1}),n>3&&y.push({dims:a,dataType:e[0].dataType}),{name:`SkipLayerNormalization`,shaderCache:{hint:`${g};${p};${m};${h}`,inputDependencies:e.map((e,t)=>`type`)},getShaderSource:v,getRunData:()=>({outputs:y,dispatchGroup:{x:Math.ceil(c/l)},programUniforms:_})}},tl=(e,t)=>{$c(e.inputs);let n=[0];e.outputCount>1&&n.push(-3),e.outputCount>2&&n.push(-3),e.outputCount>3&&n.push(3),e.compute(el(e.inputs,t,e.outputCount,!1),{outputs:n})}}),rl,il,al,ol,sl,cl,ll,ul,dl=l(()=>{R(),U(),V(),Z(),rl=(e,t)=>{if(!e||e.length<1)throw Error(`too few inputs`);if(t.axes.length!==0){if(t.axes.length!==t.starts.length||t.axes.length!==t.ends.length)throw Error(`axes, starts and ends must have the same length`)}else if(t.starts.length!==t.ends.length)throw Error(`starts and ends must have the same length`);e.slice(1).forEach((t,n)=>{if(e[n+1].dataType!==6&&e[n+1].dataType!==7)throw Error(`Input ${n} must be an array of int32 or int64`)})},il=(e,t)=>{let n=[];if(e.length>t)if(e[t].dataType===7)e[t].getBigInt64Array().forEach(e=>n.push(Number(e)));else if(e[t].dataType===6)e[t].getInt32Array().forEach(e=>n.push(Number(e)));else throw Error(`Input ${t} must be an array of int32 or int64`);return n},al=(e,t)=>{if(e.length>1){let t=il(e,1),n=il(e,2),r=il(e,3);return r.length===0&&(r=[...Array(e[0].dims.length).keys()]),B({starts:t,ends:n,axes:r})}else return t},ol=(e,t,n,r,i)=>{let a=e;return e<0&&(a+=n[r[t]]),i[t]<0?Math.max(0,Math.min(a,n[r[t]]-1)):Math.max(0,Math.min(a,n[r[t]]))},sl=(e,t,n)=>`fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${n.length}; i >= 0; i--) {
            let input_shape_i = ${J(`uniforms.input_shape`,`i`,n.length)};
            let steps_i = ${J(`uniforms.steps`,`i`,n.length)};
            let signs_i = ${J(`uniforms.signs`,`i`,n.length)};
            let starts_i = ${J(`uniforms.starts`,`i`,n.length)};
            var output_index = ${t.indicesGet(`output_indices`,`i`)};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet(`input_indices`,`i`,`input_index`)};
          }
          return input_indices;
      }`,cl=(e,t)=>{let n=e[0].dims,r=H.size(n),i=t.axes.length>0?H.normalizeAxes(t.axes,n.length):[...Array(n.length).keys()],a=il(e,4);a.forEach(e=>e!==0||(()=>{throw Error(`step cannot be 0`)})),a.length===0&&(a=Array(i.length).fill(1));let o=t.starts.map((e,t)=>ol(e,t,n,i,a)),s=t.ends.map((e,t)=>ol(e,t,n,i,a));if(i.length!==o.length||i.length!==s.length)throw Error(`start, ends and axes should have the same number of elements`);if(i.length!==n.length)for(let e=0;e<n.length;++e)i.includes(e)||(o.splice(e,0,0),s.splice(e,0,n[e]),a.splice(e,0,1));let c=a.map(e=>Math.sign(e));a.forEach((e,t,n)=>{if(e<0){let r=(s[t]-o[t])/e,i=o[t];o[t]=i+r*a[t],s[t]=i,n[t]=-e}});let l=n.slice(0);i.forEach((e,t)=>{l[e]=Math.ceil((s[e]-o[e])/a[e])});let u={dims:l,dataType:e[0].dataType},d=X(`output`,e[0].dataType,l.length),f=Y(`input`,e[0].dataType,e[0].dims.length),p=H.size(l),m=[{name:`outputSize`,type:`u32`},{name:`starts`,type:`u32`,length:o.length},{name:`signs`,type:`i32`,length:c.length},{name:`steps`,type:`u32`,length:a.length}],h=[{type:12,data:p},{type:12,data:o},{type:6,data:c},{type:12,data:a},...K(e[0].dims,l)];return{name:`Slice`,shaderCache:{hint:`${c.length}_${o.length}_${a.length}`,inputDependencies:[`rank`]},getShaderSource:e=>`
      ${e.registerUniforms(m).declareVariables(f,d)}
        ${sl(f,d,n)}
        ${e.mainStart()}
          ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.outputSize`)}
          let output_indices = ${d.offsetToIndices(`global_idx`)};
          let input_indices = calculateInputIndices(output_indices);
          ${d.setByOffset(`global_idx`,f.getByIndices(`input_indices`))}
      }`,getRunData:()=>({outputs:[u],dispatchGroup:{x:Math.ceil(r/64)},programUniforms:h})}},ll=(e,t)=>{rl(e.inputs,t);let n=al(e.inputs,t);e.compute(cl(e.inputs,n),{inputs:[0]})},ul=e=>{let t=e.starts,n=e.ends,r=e.axes;return B({starts:t,ends:n,axes:r})}}),fl,pl,ml,hl,gl=l(()=>{R(),U(),V(),bn(),Z(),fl=e=>{if(!e||e.length!==1)throw Error(`Softmax op requires 1 input.`)},pl=(e,t)=>{let n=e.inputs[0],r=n.dims,i=H.size(r),a=r.length,o=H.normalizeAxis(t.axis,a),s=o<r.length-1,c,l=[];s?(l=Array.from({length:a},(e,t)=>t),l[o]=a-1,l[a-1]=o,c=e.compute(_n(n,l),{inputs:[n],outputs:[-1]})[0]):c=n;let u=c.dims,d=u[a-1],f=i/d,p=q(d),m=d/p,h=(e,t)=>t===4?`max(max(${e}.x, ${e}.y), max(${e}.z, ${e}.w))`:t===2?`max(${e}.x, ${e}.y)`:t===3?`max(max(${e}.x, ${e}.y), ${e}.z)`:e,g=Y(`x`,c.dataType,c.dims,p),_=X(`result`,c.dataType,c.dims,p),v=g.type.value,y=W(c.dataType)===`f32`?`var threadMax = ${v}(-3.402823e+38f);`:`var threadMax = ${v}(-65504.0h);`,b=e.compute({name:`Softmax`,shaderCache:{hint:`${p}`,inputDependencies:[`type`]},getRunData:()=>({outputs:[{dims:u,dataType:c.dataType}],dispatchGroup:{x:f},programUniforms:[{type:6,data:m}]}),getShaderSource:e=>`
      var<workgroup> rowMaxShared : ${v};
      var<workgroup> rowSumShared : ${v};
      var<workgroup> threadShared : array<${v}, 64>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${v} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${v}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${e.registerUniform(`packedCols`,`i32`).declareVariables(g,_)}
      ${e.mainStart()}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = 64;
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${y}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${v}(${h(`threadShared[0]`,p)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${v}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${v}(${on(`threadShared[0]`,p)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          let value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          setValue(row, col, row_stride, value);
        }
      }`},{inputs:[c],outputs:[s?-1:0]})[0];s&&e.compute(_n(b,l),{inputs:[b]})},ml=(e,t)=>{fl(e.inputs),pl(e,t)},hl=e=>B({axis:e.axis})}),_l,vl,yl,bl,xl,Sl,Cl,wl=l(()=>{R(),U(),V(),Z(),_l=e=>{if(!e||e.length<1)throw Error(`too few inputs`)},vl=(e,t)=>{let n=[],r=t.numOutputs;return e[1].dims[0]>0&&(e[1].getBigInt64Array().forEach(e=>n.push(Number(e))),r=n.length),B({numOutputs:r,axis:t.axis,splitSizes:n})},yl=e=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${J(`uniforms.size_in_split_axis`,`i`,e)}) {
        return i;
    }
    }
    return ${e}u;
}`,bl=e=>{let t=e.length,n=[];for(let r=0;r<t;++r){let i=e[r].setByIndices(`indices`,`input[global_idx]`);t===1?n.push(i):r===0?n.push(`if (output_number == ${r}u) { ${i} }`):r===t-1?n.push(`else { ${i} }`):n.push(`else if (output_number == ${r}) { ${i} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${n.join(`
`)}
      }`},xl=(e,t)=>{let n=e[0].dims,r=H.size(n),i=e[0].dataType,a=H.normalizeAxis(t.axis,n.length),o=Array(t.numOutputs),s=Y(`input`,i,n.length),c=Array(t.numOutputs),l=[],u=[],d=0,f=[{type:12,data:r}];for(let r=0;r<t.numOutputs;r++){d+=t.splitSizes[r],c[r]=d;let s=n.slice();s[a]=t.splitSizes[r],u.push(s),o[r]=X(`output${r}`,i,s.length),l.push({dims:u[r],dataType:e[0].dataType})}return f.push({type:12,data:c},...K(n,...u)),{name:`Split`,shaderCache:{hint:t.cacheKey,inputDependencies:[`rank`]},getShaderSource:e=>`
  ${e.registerUniform(`input_size`,`u32`).registerUniform(`size_in_split_axis`,`u32`,c.length).declareVariables(s,...o)}
  ${yl(c.length)}
  ${bl(o)}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.input_size`)}

    var indices = ${s.offsetToIndices(`global_idx`)};
    var index = ${s.indicesGet(`indices`,a)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${J(`uniforms.size_in_split_axis`,`output_number - 1u`,c.length)};
      ${s.indicesSet(`indices`,a,`index`)};
    }
    writeBufferData(output_number, indices, global_idx);
  }`,getRunData:()=>({outputs:l,dispatchGroup:{x:Math.ceil(r/64)},programUniforms:f})}},Sl=(e,t)=>{_l(e.inputs);let n=e.inputs.length===1?t:vl(e.inputs,t);e.compute(xl(e.inputs,n),{inputs:[0]})},Cl=e=>{let t=e.axis,n=e.splitSizes,r=e.numOutputs<0?n.length:e.numOutputs;if(r!==n.length)throw Error(`numOutputs and splitSizes lengh must be equal`);return B({axis:t,numOutputs:r,splitSizes:n})}}),Tl,El,Dl,Ol=l(()=>{R(),U(),Z(),Tl=(e,t,n,r,i)=>{let a=X(`output_data`,i,n.length,4),o=Y(`a_data`,t[1].dataType,t[1].dims.length,4),s=Y(`b_data`,t[2].dataType,t[2].dims.length,4),c=Y(`c_data`,t[0].dataType,t[0].dims.length,4),l,u=(e,t,n)=>`select(${t}, ${e}, ${n})`;if(!r)l=a.setByOffset(`global_idx`,u(o.getByOffset(`global_idx`),s.getByOffset(`global_idx`),c.getByOffset(`global_idx`)));else{let e=(e,t,n=``)=>{let r=`a_data[index_a${t}][component_a${t}]`,i=`b_data[index_b${t}][component_b${t}]`,l=`bool(c_data[index_c${t}] & (0xffu << (component_c${t} * 8)))`;return`
            let output_indices${t} = ${a.offsetToIndices(`global_idx * 4u + ${t}u`)};
            let offset_a${t} = ${o.broadcastedIndicesToOffset(`output_indices${t}`,a)};
            let offset_b${t} = ${s.broadcastedIndicesToOffset(`output_indices${t}`,a)};
            let offset_c${t} = ${c.broadcastedIndicesToOffset(`output_indices${t}`,a)};
            let index_a${t} = offset_a${t} / 4u;
            let index_b${t} = offset_b${t} / 4u;
            let index_c${t} = offset_c${t} / 4u;
            let component_a${t} = offset_a${t} % 4u;
            let component_b${t} = offset_b${t} % 4u;
            let component_c${t} = offset_c${t} % 4u;
            ${e}[${t}] = ${n}(${u(r,i,l)});
          `};l=i===9?`
            var data = vec4<u32>(0);
            ${e(`data`,0,`u32`)}
            ${e(`data`,1,`u32`)}
            ${e(`data`,2,`u32`)}
            ${e(`data`,3,`u32`)}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:`
            ${e(`output_data[global_idx]`,0)}
            ${e(`output_data[global_idx]`,1)}
            ${e(`output_data[global_idx]`,2)}
            ${e(`output_data[global_idx]`,3)}
          `}return`
        ${e.registerUniform(`vec_size`,`u32`).declareVariables(c,o,s,a)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes(`uniforms.vec_size`)}
        ${l}
      }`},El=e=>{let t=e[1].dims,n=e[2].dims,r=e[0].dims,i=e[1].dataType,a=!(H.areEqual(t,n)&&H.areEqual(n,r)),o=t,s=H.size(t);if(a){let e=Xt.calcShape(Xt.calcShape(t,n,!1),r,!1);if(!e)throw Error(`Can't perform where op on the given tensors`);o=e,s=H.size(o)}let c=Math.ceil(s/4);return{name:`Where`,shaderCache:{inputDependencies:[`rank`,`rank`,`rank`]},getShaderSource:t=>Tl(t,e,o,a,i),getRunData:()=>({outputs:[{dims:o,dataType:i}],dispatchGroup:{x:Math.ceil(s/64/4)},programUniforms:[{type:12,data:c},...K(r,t,n,o)]})}},Dl=e=>{e.compute(El(e.inputs))}}),kl,Al=l(()=>{yr(),Dr(),Mr(),Ir(),ji(),Gi(),Qi(),Ka(),lo(),mo(),bo(),Mo(),Ro(),Vo(),Ko(),Zo(),ns(),ss(),Os(),Ns(),Ls(),Ia(),Us(),hs(),$s(),yc(),wc(),Oc(),hr(),Jc(),Qc(),nl(),dl(),gl(),wl(),xs(),bn(),Di(),Ol(),kl=new Map([[`Abs`,[Rr]],[`Acos`,[zr]],[`Acosh`,[Br]],[`Add`,[Fi]],[`ArgMax`,[Q,vr]],[`ArgMin`,[_r,vr]],[`Asin`,[Vr]],[`Asinh`,[Hr]],[`Atan`,[Ur]],[`Atanh`,[Wr]],[`Attention`,[Er]],[`AveragePool`,[uc,lc]],[`BatchNormalization`,[jr]],[`BiasAdd`,[Fr]],[`BiasSplitGelu`,[Ai]],[`Cast`,[Kr,Gr]],[`Ceil`,[Yr]],[`Clip`,[Jr]],[`Concat`,[Xi,Zi]],[`Conv`,[Ga,Va]],[`ConvTranspose`,[co,ro]],[`Cos`,[Xr]],[`Cosh`,[Zr]],[`CumSum`,[fo,po]],[`DepthToSpace`,[vo,yo]],[`DequantizeLinear`,[Sc,Cc]],[`Div`,[Ii]],[`Einsum`,[Ao,jo]],[`Elu`,[$r,Qr]],[`Equal`,[Li]],[`Erf`,[ti]],[`Exp`,[ni]],[`Expand`,[Lo]],[`FastGelu`,[Bo]],[`Floor`,[ri]],[`FusedConv`,[Ga,Va]],[`Gather`,[Go,Wo]],[`GatherElements`,[ts,es]],[`GatherBlockQuantized`,[Yo,Xo]],[`Gelu`,[ii]],[`Gemm`,[os,as]],[`GlobalAveragePool`,[pc,fc]],[`GlobalMaxPool`,[vc,_c]],[`Greater`,[Vi]],[`GreaterOrEqual`,[Ui]],[`GroupQueryAttention`,[Ds,ws]],[`HardSigmoid`,[fi,di]],[`InstanceNormalization`,[Ms]],[`LayerNormalization`,[Is]],[`LeakyRelu`,[ai,Qr]],[`Less`,[Hi]],[`LessOrEqual`,[Wi]],[`Log`,[Ci]],[`MatMul`,[Fa]],[`MatMulNBits`,[Vs,Hs]],[`MaxPool`,[hc,gc]],[`Mul`,[Ri]],[`MultiHeadAttention`,[ms,us]],[`Neg`,[si]],[`Not`,[oi]],[`Pad`,[Qs]],[`Pow`,[zi]],[`QuickGelu`,[Ei,Qr]],[`Range`,[Dc]],[`Reciprocal`,[ci]],[`ReduceMin`,[ur]],[`ReduceMean`,[ar]],[`ReduceMax`,[lr]],[`ReduceSum`,[fr]],[`ReduceProd`,[dr]],[`ReduceL1`,[or]],[`ReduceL2`,[sr]],[`ReduceLogSum`,[mr]],[`ReduceLogSumExp`,[cr]],[`ReduceSumSquare`,[pr]],[`Relu`,[li]],[`Resize`,[Kc,qc]],[`RotaryEmbedding`,[Zc]],[`Sigmoid`,[ui]],[`Sin`,[pi]],[`Sinh`,[mi]],[`Slice`,[ll,ul]],[`SkipLayerNormalization`,[tl]],[`Split`,[Sl,Cl]],[`Sqrt`,[hi]],[`Softmax`,[ml,hl]],[`Sub`,[Bi]],[`Tan`,[gi]],[`Tanh`,[vi]],[`ThresholdedRelu`,[Si,Qr]],[`Tile`,[bs]],[`Transpose`,[vn,yn]],[`Where`,[Dl]]])}),jl,Ml=l(()=>{Pe(),Pt(),Z(),jl=class{constructor(e){this.backend=e,this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,t){this.repo.set(e,t)}run(e,t,n,r,i){ve(e.programInfo.name);let a=this.backend.device,o=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let s=[];for(let e of t)s.push({binding:s.length,resource:{buffer:e.buffer}});for(let e of n)s.push({binding:s.length,resource:{buffer:e.buffer}});i&&s.push({binding:s.length,resource:i});let c=a.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:s,label:e.programInfo.name});if(this.backend.sessionStatus===`capturing`){let t={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:c,dispatchGroup:r};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(t)}o.setPipeline(e.computePipeline),o.setBindGroup(0,c),o.dispatchWorkgroups(...r),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType===`at-passes`)&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),ye(e.programInfo.name)}dispose(){}build(e,t){ve(e.name);let n=this.backend.device,r=[];n.features.has(`shader-f16`)&&r.push(`enable f16;`);let i=un(t,this.backend.device.limits),a=e.getShaderSource(i),o=`${r.join(`
`)}
${i.additionalImplementations}
${a}`,s=n.createShaderModule({code:o,label:e.name});z(`verbose`,()=>`[WebGPU] ${e.name} shader code: ${o}`);let c=n.createComputePipeline({compute:{module:s,entryPoint:`main`},layout:`auto`,label:e.name});return ye(e.name),{programInfo:e,computePipeline:c,uniformVariablesInfo:i.variablesInfo}}normalizeDispatchGroupSize(e){let t=typeof e==`number`?e:e.x,n=typeof e==`number`?1:e.y||1,r=typeof e==`number`?1:e.z||1,i=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(t<=i&&n<=i&&r<=i)return[t,n,r];let a=t*n*r,o=Math.ceil(Math.sqrt(a));if(o>i){if(o=Math.ceil(Math.cbrt(a)),o>i)throw Error(`Total dispatch size exceeds WebGPU maximum.`);return[o,o,o]}else return[o,o,1]}}}),Nl,Pl,Fl,Il,Ll=l(()=>{Pe(),R(),Pt(),It(),qt(),Al(),Ml(),Nl=(e,t)=>{if(t.length!==e.length)throw Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);let n=[];for(let r=0;r<e.length;++r){let i=e[r].dataType;switch(t[r]){case`none`:n.push(``);break;case`type`:n.push(`${i}`);break;case`rank`:{let t=e[r].dims.length;n.push(`${i};${t}`);break}case`dims`:{let t=e[r].dims.join(`,`);n.push(`${i};${t}`);break}default:throw Error(`unsupported input dependency: ${t[r]}`)}}return n.join(`|`)},Pl=(e,t,n)=>{let r=e.name;return e.shaderCache?.hint&&(r+=`[`+e.shaderCache.hint+`]`),r+=`:`+n+`:${Nl(t,e.shaderCache?.inputDependencies??Array(t.length).fill(`dims`))}`,r},Fl=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},Il=class{constructor(){this.currentSessionId=null,this.currentKernelId=null,this.commandEncoder=null,this.computePassEncoder=null,this.maxDispatchNumber=16,this.pendingDispatchNumber=0,this.pendingKernels=[],this.pendingQueries=new Map,this.sessionStatus=`default`,this.capturedCommandList=new Map,this.capturedPendingKernels=new Map,this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw Error(`currentKernelCustomData(): currentKernelId is null. (should not happen)`);let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,t){this.env=e;let n=[],r={requiredLimits:{maxComputeWorkgroupStorageSize:t.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:t.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:t.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:t.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:t.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:t.limits.maxComputeWorkgroupSizeZ},requiredFeatures:n};t.features.has(`chromium-experimental-timestamp-query-inside-passes`)?n.push(`chromium-experimental-timestamp-query-inside-passes`):t.features.has(`timestamp-query`)&&n.push(`timestamp-query`),t.features.has(`shader-f16`)&&n.push(`shader-f16`),this.device=await t.requestDevice(r),this.adapterInfo=new Fl(t.info||await t.requestAdapterInfo()),this.gpuDataManager=Kt(this),this.programManager=new jl(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,Mt(e.logLevel,!!e.debug),this.device.onuncapturederror=e=>{e.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${e.error.message}`)},Object.defineProperty(this.env.webgpu,`device`,{value:this.device,writable:!1,enumerable:!0,configurable:!1}),Object.defineProperty(this.env.webgpu,`adapter`,{value:t,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<`u`&&this.querySet.destroy(),this.gpuDataManager.dispose()}getCommandEncoder(){return this.commandEncoder||=this.device.createCommandEncoder(),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),t={};this.queryType===`at-passes`&&(t.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(t)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&=(this.computePassEncoder.end(),null)}flush(){if(!this.commandEncoder)return;ve(),this.endComputePass();let e;this.queryType!==`none`&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!==`none`&&e.mapAsync(GPUMapMode.READ).then(()=>{let t=new BigUint64Array(e.getMappedRange()),n=this.pendingQueries.get(e);for(let e=0;e<t.length/2;e++){let r=n[e],i=r.kernelId,a=this.kernels.get(i),o=a.kernelType,s=a.kernelName,c=r.programName,l=r.inputTensorViews,u=r.outputTensorViews,d=t[e*2],f=t[e*2+1];typeof this.queryTimeBase>`u`&&(this.queryTimeBase=d);let p=Number(d-this.queryTimeBase),m=Number(f-this.queryTimeBase);if(!Number.isSafeInteger(p)||!Number.isSafeInteger(m))throw RangeError(`incorrect timestamp range`);if(this.env.webgpu.profiling?.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:l.map(e=>({dims:e.dims,dataType:yt(e.dataType)})),outputsMetadata:u.map(e=>({dims:e.dims,dataType:yt(e.dataType)})),kernelId:i,kernelType:o,kernelName:s,programName:c,startTime:p,endTime:m});else{let e=``;l.forEach((t,n)=>{e+=`input[${n}]: [${t.dims}] | ${yt(t.dataType)}, `});let t=``;u.forEach((e,n)=>{t+=`output[${n}]: [${e.dims}] | ${yt(e.dataType)}, `}),console.log(`[profiling] kernel "${i}|${o}|${s}|${c}" ${e}${t}execution time: ${m-p} ns`)}ge(`GPU`,`${c}::${d}::${f}`)}e.unmap(),this.pendingQueries.delete(e)}),ye()}run(e,t,n,r,i,a){ve(e.name);let o=[];for(let e=0;e<t.length;++e){let n=t[e].data;if(n===0)continue;let r=this.gpuDataManager.get(n);if(!r)throw Error(`no GPU data for input: ${n}`);o.push(r)}let{outputs:s,dispatchGroup:c,programUniforms:l}=e.getRunData(t),u=n.length===0?s.map((e,t)=>t):n;if(u.length!==s.length)throw Error(`Output size ${u.length} must be equal to ${s.length}.`);let d=[],f=[];for(let e=0;e<s.length;++e){if(!Number.isInteger(u[e])||u[e]<-3||u[e]>=a)throw Error(`Invalid output index: ${u[e]}`);if(u[e]===-3)continue;let t=u[e]===-1,n=u[e]===-2,o=t||n?i(s[e].dataType,s[e].dims):r(u[e],s[e].dataType,s[e].dims);if(d.push(o),o.data===0)continue;let c=this.gpuDataManager.get(o.data);if(!c)throw Error(`no GPU data for output: ${o.data}`);if(t&&this.temporaryData.push(c),n){let e=this.kernelPersistentData.get(this.currentKernelId);e||(e=[],this.kernelPersistentData.set(this.currentKernelId,e)),e.push(c)}f.push(c)}if(o.length!==t.length||f.length!==d.length){if(f.length===0)return ye(e.name),d;throw Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let p;if(l){let e=0,t=[];l.forEach(n=>{let r=typeof n.data==`number`?[n.data]:n.data;if(r.length===0)return;let i=n.type===10?2:4,a,o;n.type===10?(o=r.length>4?16:r.length>2?8:r.length*i,a=r.length>4?16:i*r.length):(o=r.length<=2?r.length*i:16,a=16),e=Math.ceil(e/o)*o,t.push(e);let s=n.type===10?8:4;e+=r.length>4?Math.ceil(r.length/s)*a:r.length*i}),e=Math.ceil(e/16)*16;let n=new ArrayBuffer(e);l.forEach((e,r)=>{let i=t[r],a=typeof e.data==`number`?[e.data]:e.data;if(e.type===6)new Int32Array(n,i,a.length).set(a);else if(e.type===12)new Uint32Array(n,i,a.length).set(a);else if(e.type===10)new Uint16Array(n,i,a.length).set(a);else if(e.type===1)new Float32Array(n,i,a.length).set(a);else throw Error(`Unsupported uniform type: ${yt(e.type)}`)});let r=this.gpuDataManager.create(e,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(r.buffer,0,n,0,e),this.gpuDataManager.release(r.id),p={offset:0,size:e,buffer:r.buffer}}let m=this.programManager.normalizeDispatchGroupSize(c),h=m[1]===1&&m[2]===1,g=Pl(e,t,h),_=this.programManager.getArtifact(g);if(_||(_=this.programManager.build(e,m),this.programManager.setArtifact(g,_),z(`info`,()=>`[artifact] key: ${g}, programName: ${e.name}`)),l&&_.uniformVariablesInfo){if(l.length!==_.uniformVariablesInfo.length)throw Error(`Uniform variables count mismatch: expect ${_.uniformVariablesInfo.length}, got ${l.length} in program "${_.programInfo.name}".`);for(let e=0;e<l.length;e++){let t=l[e],n=t.type,r=typeof t.data==`number`?1:t.data.length,[i,a]=_.uniformVariablesInfo[e];if(n!==i||r!==a)throw Error(`Uniform variable ${e} mismatch: expect type ${i} with size ${a}, got type ${n} with size ${r} in program "${_.programInfo.name}".`)}}if(z(`info`,()=>`[ProgramManager] run "${e.name}" (key=${g}) with ${m[0]}x${m[1]}x${m[2]}`),this.queryType!==`none`||this.sessionStatus===`capturing`){let e={kernelId:this.currentKernelId,programName:_.programInfo.name,inputTensorViews:t,outputTensorViews:d};this.pendingKernels.push(e),this.sessionStatus===`capturing`&&this.capturedPendingKernels.get(this.currentSessionId).push(e)}return this.programManager.run(_,o,f,m,p),ye(e.name),d}upload(e,t){this.gpuDataManager.upload(e,t)}memcpy(e,t){this.gpuDataManager.memcpy(e,t)}async download(e,t){await this.gpuDataManager.download(e,t)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,t,n,r){let i=kl.get(e);if(!i)throw Error(`kernel not implemented: ${e}`);let a={kernelType:e,kernelName:r,kernelEntry:i[0],attributes:[i[1],n]};this.kernels.set(t,a)}releaseKernel(e){let t=this.kernelPersistentData.get(e);if(t){for(let e of t)this.gpuDataManager.release(e.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,t,n){let r=this.kernels.get(e);if(!r)throw Error(`kernel not created: ${e}`);let i=r.kernelType,a=r.kernelName,o=r.kernelEntry,s=r.attributes;if(this.currentKernelId!==null)throw Error(`kernel "[${i}] ${a}" is not allowed to be called recursively`);this.currentKernelId=e,s[0]&&=(s[1]=s[0](s[1]),void 0),z(`info`,()=>`[WebGPU] Start to run kernel "[${i}] ${a}"...`);let c=this.env.debug;this.temporaryData=[];try{return c&&this.device.pushErrorScope(`validation`),o(t,s[1]),0}catch(e){return n.push(Promise.resolve(`[WebGPU] Kernel "[${i}] ${a}" failed. ${e}`)),1}finally{c&&n.push(this.device.popErrorScope().then(e=>e?`GPU validation error for kernel "[${i}] ${a}": ${e.message}`:null));for(let e of this.temporaryData)this.gpuDataManager.release(e.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,t,n,r){let i=this.sessionExternalDataMapping.get(e);i||(i=new Map,this.sessionExternalDataMapping.set(e,i));let a=i.get(t),o=this.gpuDataManager.registerExternalBuffer(n,r,a);return i.set(t,[o,n]),o}unregisterBuffers(e){let t=this.sessionExternalDataMapping.get(e);t&&(t.forEach(e=>this.gpuDataManager.unregisterExternalBuffer(e[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let t=this.gpuDataManager.get(e);if(!t)throw Error(`no GPU data for buffer: ${e}`);return t.buffer}createDownloader(e,t,n){return async()=>{let r=await Wt(this,e,t);return Ft(r.buffer,n)}}writeTimestamp(e){this.queryType===`inside-passes`&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){this.queryType=`none`,(this.env.webgpu.profiling?.mode===`default`||(typeof this.env.trace>`u`?this.env.wasm.trace:this.env.trace))&&(this.device.features.has(`chromium-experimental-timestamp-query-inside-passes`)?this.queryType=`inside-passes`:this.device.features.has(`timestamp-query`)&&(this.queryType=`at-passes`),this.queryType!==`none`&&typeof this.querySet>`u`&&(this.querySet=this.device.createQuerySet({type:`timestamp`,count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){z(`info`,`captureBegin`),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus=`capturing`}captureEnd(){z(`info`,`captureEnd`),this.flush(),this.sessionStatus=`default`}replay(){z(`info`,`replay`),this.sessionStatus=`replaying`;let e=this.capturedCommandList.get(this.currentSessionId),t=this.capturedPendingKernels.get(this.currentSessionId),n=e.length;this.pendingKernels=[];for(let r=0;r<n;r++){let n=this.getComputePassEncoder(),i=e[r];this.writeTimestamp(this.pendingDispatchNumber*2),n.setPipeline(i.computePipeline),n.setBindGroup(0,i.bindGroup),n.dispatchWorkgroups(...i.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!==`none`&&this.pendingKernels.push(t[r]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType===`at-passes`)&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus=`default`}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}}),Rl,zl,Bl,Vl,Hl,Ul=l(()=>{Pt(),Rl=1,zl=()=>Rl++,Bl=class{constructor(e,t){this.mlContext=e,this.tensorEntry=t,this.tensorCache=t?[t]:[]}get tensor(){return this.tensorEntry?.[0]}get context(){if(!this.mlContext)throw Error(`MLContext has not been set.`);return this.mlContext}set context(e){if(this.mlContext&&this.mlContext!==e)throw Error(`MLTensor in use in a different MLContext.`);this.mlContext=e}destroy(){for(let[e]of this.tensorCache)e.destroy();this.tensorCache=[],this.tensorEntry=void 0}trySelectTensor(e,t){for(let[n,r,i]of this.tensorCache)if(t===n){if(this.context!==e)throw Error(`MLTensor cannot be registered with a different MLContext.`);return this.tensorEntry=[n,r,i],!0}return!1}async ensureTensor(e,t,n){if(this.tensorEntry){let[n,r,i]=this.tensorEntry;if(r===e&&i.every((e,n)=>e===t[n]))return n}for(let[r,i,a]of this.tensorCache)if(i===e&&a.every((e,n)=>e===t[n])){if(n&&this.tensorEntry){z(`verbose`,()=>`[WebNN] Slowdown may occur, having to copy existing tensor {dataType: ${e}, shape: ${t}}`);let n=await this.context.readTensor(this.tensorEntry[0]);this.context.writeTensor(r,n)}return this.tensorEntry=[r,i,a],r}z(`verbose`,()=>`[WebNN] MLContext.createTensor {dataType: ${e}, shape: ${t}}`);let r=MLTensorUsage.READ|MLTensorUsage.WRITE,i=await this.context.createTensor({dataType:e,shape:t,dimensions:t,usage:r});return this.tensorEntry=[i,e,t],this.tensorCache.push(this.tensorEntry),this.activeUpload&&=(this.mlContext?.writeTensor(i,this.activeUpload),void 0),i}upload(e){if(!this.tensorEntry){this.activeUpload=new Uint8Array(e);return}this.mlContext?.writeTensor(this.tensorEntry[0],e)}async download(e){if(this.activeUpload)if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(this.activeUpload):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(this.activeUpload);return}else return this.activeUpload.buffer;if(!this.tensorEntry)throw Error(`Tensor has not been created.`);return e?this.context.readTensor(this.tensorEntry[0],e):this.context.readTensor(this.tensorEntry[0])}},Vl=class{constructor(e){this.backend=e,this.tensorsById=new Map,this.tensorIdsByContext=new Map}reserveTensorId(){let e=zl();return this.tensorsById.set(e,new Bl),e}releaseTensorId(e){let t=this.tensorsById.get(e);if(t){t.destroy(),this.tensorsById.delete(e);for(let[t,n]of this.tensorIdsByContext)if(n.has(e)){n.delete(e),n.size===0&&this.tensorIdsByContext.delete(t);break}}}async ensureTensor(e,t,n,r){z(`verbose`,()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${e}, dataType: ${t}, shape: ${n}, copyOld: ${r}}`);let i=this.tensorsById.get(e);if(!i)throw Error(`Tensor not found.`);return i.context=this.backend.currentContext,this.tensorIdsByContext.has(this.backend.currentContext)||this.tensorIdsByContext.set(this.backend.currentContext,new Set),this.tensorIdsByContext.get(this.backend.currentContext)?.add(e),i.ensureTensor(t,n,r)}upload(e,t){this.tensorsById.get(e).upload(t)}async download(e,t){return z(`verbose`,()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${t?.byteLength}}`),this.tensorsById.get(e).download(t)}releaseTensorsForContext(e){let t=this.tensorIdsByContext.get(e);if(t){for(let e of t)this.tensorsById.get(e).destroy(),this.tensorsById.delete(e);this.tensorIdsByContext.delete(e)}}registerTensor(e,t,n,r){for(let[n,r]of this.tensorsById)if(r.trySelectTensor(e,t))return n;let i=zl();this.tensorsById.set(i,new Bl(e,[t,n,r]));let a=this.tensorIdsByContext.get(e);return a||(a=new Set,this.tensorIdsByContext.set(e,a)),a.add(i),i}},Hl=(...e)=>new Vl(...e)}),Wl,Gl,Kl=l(()=>{R(),st(),It(),Ul(),Pt(),Wl=new Map([[1,`float32`],[10,`float16`],[6,`int32`],[12,`uint32`],[7,`int64`],[13,`uint64`],[3,`int8`],[2,`uint8`],[9,`uint8`]]),Gl=class{constructor(e){this.tensorManager=Hl(this),this.mlContextBySessionId=new Map,this.sessionIdsByMLContext=new Map,Mt(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw Error(`No active session`);return this.activeSessionId}onRunStart(e){this.activeSessionId=e}get currentContext(){let e=this.getMLContext(this.currentSessionId);if(!e)throw Error(`No MLContext found for session ${this.currentSessionId}`);return e}registerMLContext(e,t){this.mlContextBySessionId.set(e,t);let n=this.sessionIdsByMLContext.get(t);n||(n=new Set,this.sessionIdsByMLContext.set(t,n)),n.add(e)}onReleaseSession(e){let t=this.mlContextBySessionId.get(e);if(!t)return;this.mlContextBySessionId.delete(e);let n=this.sessionIdsByMLContext.get(t);n.delete(e),n.size===0&&(this.sessionIdsByMLContext.delete(t),this.tensorManager.releaseTensorsForContext(t))}getMLContext(e){return this.mlContextBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){z(`verbose`,()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,t,n,r){let i=Wl.get(t);if(!i)throw Error(`Unsupported ONNX data type: ${t}`);return this.tensorManager.ensureTensor(e,i,n,r)}uploadTensor(e,t){if(!F().shouldTransferToMLTensor)throw Error(`Trying to upload to a MLTensor while shouldTransferToMLTensor is false`);z(`verbose`,()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${t.byteLength}}`),this.tensorManager.upload(e,t)}async downloadTensor(e,t){return this.tensorManager.download(e,t)}createMLTensorDownloader(e,t){return async()=>{let n=await this.tensorManager.download(e);return Ft(n,t)}}registerMLTensor(e,t,n){let r=Wl.get(t);if(!r)throw Error(`Unsupported ONNX data type: ${t}`);let i=this.tensorManager.registerTensor(this.currentContext,e,r,n);return z(`verbose`,()=>`[WebNN] registerMLTensor {tensor: ${e}, dataType: ${r}, dimensions: ${n}} -> {tensorId: ${i}}`),i}flush(){}}}),ql={};u(ql,{init:()=>Xl});var Jl,Yl,Xl,Zl=l(()=>{R(),Ll(),Pt(),U(),Kl(),Jl=class e{constructor(e,t,n,r){this.module=e,this.dataType=t,this.data=n,this.dims=r}getFloat32Array(){if(this.dataType!==1)throw Error(`Invalid data type`);let e=H.size(this.dims);return e===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,e)}getBigInt64Array(){if(this.dataType!==7)throw Error(`Invalid data type`);let e=H.size(this.dims);return e===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,e)}getInt32Array(){if(this.dataType!==6)throw Error(`Invalid data type`);let e=H.size(this.dims);return e===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,e)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw Error(`Invalid data type`);let e=H.size(this.dims);return e===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,e)}reshape(t){if(H.size(t)!==H.size(this.dims))throw Error(`Invalid new shape`);return new e(this.module,this.dataType,this.data,t)}},Yl=class{constructor(e,t,n){this.module=e,this.backend=t,this.customDataOffset=0,this.customDataSize=0,this.adapterInfo=t.adapterInfo;let r=e.HEAPU32,i=n>>>2;this.opKernelContext=r[i++];let a=r[i++];this.outputCount=r[i++],this.customDataOffset=r[i++],this.customDataSize=r[i++];let o=[];for(let t=0;t<a;t++){let t=r[i++],n=r[i++],a=r[i++],s=[];for(let e=0;e<a;e++)s.push(r[i++]);o.push(new Jl(e,t,n,s))}this.inputs=o}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}getMaxComputeWorkgroupSizes(){return[this.backend.device.limits.maxComputeWorkgroupSizeX,this.backend.device.limits.maxComputeWorkgroupSizeY,this.backend.device.limits.maxComputeWorkgroupSizeZ]}getMaxComputeWorkgroupStoragesize(){return this.backend.device.limits.maxComputeWorkgroupStorageSize}compute(e,t){let n=t?.inputs?.map(e=>typeof e==`number`?this.inputs[e]:e)??this.inputs,r=t?.outputs??[];return this.backend.run(e,n,r,(e,t,n)=>new Jl(this.module,t,this.output(e,n),n),(e,t)=>{let n=bt(e,t);if(!n)throw Error(`Unsupported data type: ${e}`);let r=n>0?this.backend.gpuDataManager.create(n).id:0;return new Jl(this.module,e,r,t)},this.outputCount)}output(e,t){let n=this.module.stackSave();try{let n=this.module.stackAlloc((1+t.length)*4),r=n>>2;this.module.HEAPU32[r++]=t.length;for(let e=0;e<t.length;e++)this.module.HEAPU32[r++]=t[e];return this.module._JsepOutput(this.opKernelContext,e,n)}catch(n){throw Error(`Failed to generate kernel's output[${e}] with dims [${t}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${n}`)}finally{this.module.stackRestore(n)}}},Xl=async(e,t,n,r)=>{let i=t.jsepInit;if(!i)throw Error(`Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.`);if(e===`webgpu`){let e=new Il;await e.initialize(n,r),i(`webgpu`,[e,t=>e.alloc(t),t=>e.free(t),(n,r,i,a=!1)=>{if(a)z(`verbose`,()=>`[WebGPU] jsepCopyGpuToGpu: src=${n}, dst=${r}, size=${i}`),e.memcpy(n,r);else{z(`verbose`,()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${n}, gpuDataId=${r}, size=${i}`);let a=t.HEAPU8.subarray(n>>>0,(n>>>0)+i);e.upload(r,a)}},async(n,r,i)=>{z(`verbose`,()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${n}, dataOffset=${r}, size=${i}`),await e.download(n,()=>t.HEAPU8.subarray(r>>>0,(r>>>0)+i))},(n,r,i)=>e.createKernel(n,r,i,t.UTF8ToString(t._JsepGetNodeName(r))),t=>e.releaseKernel(t),(n,r,i,a)=>{z(`verbose`,()=>`[WebGPU] jsepRun: sessionHandle=${i}, kernel=${n}, contextDataOffset=${r}`);let o=new Yl(t,e,r);return e.computeKernel(n,o,a)},()=>e.captureBegin(),()=>e.captureEnd(),()=>e.replay()])}else{let e=new Gl(n);i(`webnn`,[e,()=>e.reserveTensorId(),t=>e.releaseTensorId(t),async(t,n,r,i)=>e.ensureTensor(t,n,r,i),(t,n)=>{e.uploadTensor(t,n)},async(t,n)=>e.downloadTensor(t,n)])}}}),Ql,$l,eu,tu,nu,ru,iu,au,ou,su,cu,lu,uu=l(()=>{dt(),_t(),R(),st(),lt(),Dt(),Ql=(e,t)=>{F()._OrtInit(e,t)!==0&&L(`Can't initialize onnxruntime.`)},$l=async e=>{Ql(e.wasm.numThreads,St(e.logLevel))},eu=async(e,t)=>{{let n=(Zl(),f(ql)).init;if(t===`webgpu`){if(typeof navigator>`u`||!navigator.gpu)throw Error(`WebGPU is not supported in current environment`);let t=e.webgpu.adapter;if(t){if(typeof t.limits!=`object`||typeof t.features!=`object`||typeof t.requestDevice!=`function`)throw Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let n=e.webgpu.powerPreference;if(n!==void 0&&n!==`low-power`&&n!==`high-performance`)throw Error(`Invalid powerPreference setting: "${n}"`);let r=e.webgpu.forceFallbackAdapter;if(r!==void 0&&typeof r!=`boolean`)throw Error(`Invalid forceFallbackAdapter setting: "${r}"`);if(t=await navigator.gpu.requestAdapter({powerPreference:n,forceFallbackAdapter:r}),!t)throw Error(`Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.`)}await n(`webgpu`,F(),e,t)}if(t===`webnn`){if(typeof navigator>`u`||!navigator.ml)throw Error(`WebNN is not supported in current environment`);await n(`webnn`,F(),e)}}},tu=new Map,nu=e=>{let t=F(),n=t.stackSave();try{let n=t.stackAlloc(8);return t._OrtGetInputOutputCount(e,n,n+4)!==0&&L(`Can't get session input/output count.`),[t.HEAP32[n/4],t.HEAP32[n/4+1]]}finally{t.stackRestore(n)}},ru=e=>{let t=F(),n=t._malloc(e.byteLength);if(n===0)throw Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);return t.HEAPU8.set(e,n),[n,e.byteLength]},iu=async(e,t)=>{let n,r,i=F();Array.isArray(e)?[n,r]=e:e.buffer===i.HEAPU8.buffer?[n,r]=[e.byteOffset,e.byteLength]:[n,r]=ru(e);let a=0,o=0,s=0,c=[],l=[],u=[];try{if([o,c]=gt(t),t?.externalData&&i.mountExternalData){let e=[];for(let n of t.externalData){let t=typeof n==`string`?n:n.path;e.push(Et(typeof n==`string`?n:n.data).then(e=>{i.mountExternalData(t,e)}))}await Promise.all(e)}for(let e of t?.executionProviders??[])if((typeof e==`string`?e:e.name)===`webnn`){if(i.shouldTransferToMLTensor=!1,i.currentContext)throw Error(`WebNN execution provider is already set.`);if(typeof e!=`string`){let t=e,n=t?.context,r=t?.gpuDevice,a=t?.deviceType,o=t?.numThreads,s=t?.powerPreference;n?i.currentContext=n:r?i.currentContext=await navigator.ml.createContext(r):i.currentContext=await navigator.ml.createContext({deviceType:a,numThreads:o,powerPreference:s})}else i.currentContext=await navigator.ml.createContext();break}a=await i._OrtCreateSession(n,r,o),a===0&&L(`Can't create a session.`),i.currentContext&&(i.jsepRegisterMLContext(a,i.currentContext),i.currentContext=void 0,i.shouldTransferToMLTensor=!0);let[e,d]=nu(a),f=!!t?.enableGraphCapture,p=[],m=[],h=[];for(let t=0;t<e;t++){let e=i._OrtGetInputName(a,t);e===0&&L(`Can't get an input name.`),l.push(e),p.push(i.UTF8ToString(e))}for(let e=0;e<d;e++){let n=i._OrtGetOutputName(a,e);n===0&&L(`Can't get an output name.`),u.push(n);let r=i.UTF8ToString(n);m.push(r);{if(f&&t?.preferredOutputLocation===void 0){h.push(`gpu-buffer`);continue}let e=typeof t?.preferredOutputLocation==`string`?t.preferredOutputLocation:t?.preferredOutputLocation?.[r]??`cpu`;if(e!==`cpu`&&e!==`cpu-pinned`&&e!==`gpu-buffer`&&e!==`ml-tensor`)throw Error(`Not supported preferred output location: ${e}.`);if(f&&e!==`gpu-buffer`)throw Error(`Not supported preferred output location: ${e}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);h.push(e)}}let g=null;return h.some(e=>e===`gpu-buffer`||e===`ml-tensor`)&&(s=i._OrtCreateBinding(a),s===0&&L(`Can't create IO binding.`),g={handle:s,outputPreferredLocations:h,outputPreferredLocationsEncoded:h.map(e=>Tt(e))}),tu.set(a,[a,l,u,g,f,!1]),[a,p,m]}catch(e){throw l.forEach(e=>i._OrtFree(e)),u.forEach(e=>i._OrtFree(e)),s!==0&&i._OrtReleaseBinding(s),a!==0&&i._OrtReleaseSession(a),e}finally{i._free(n),o!==0&&i._OrtReleaseSessionOptions(o),c.forEach(e=>i._free(e)),i.unmountExternalData?.()}},au=e=>{let t=F(),n=tu.get(e);if(!n)throw Error(`cannot release session. invalid session id: ${e}`);let[r,i,a,o,s]=n;o&&(s&&t._OrtClearBoundOutputs(o.handle),t._OrtReleaseBinding(o.handle)),t.jsepOnReleaseSession?.(e),i.forEach(e=>t._OrtFree(e)),a.forEach(e=>t._OrtFree(e)),t._OrtReleaseSession(r),tu.delete(e)},ou=(e,t,n,r,i,a=!1)=>{if(!e){t.push(0);return}let o=F(),s=e[0],c=e[1],l=e[3],u,d;if(s===`string`&&(l===`gpu-buffer`||l===`ml-tensor`))throw Error(`String tensor is not supported on GPU.`);if(a&&l!==`gpu-buffer`)throw Error(`External buffer must be provided for input/output index ${i} when enableGraphCapture is true.`);if(l===`gpu-buffer`){let t=e[2].gpuBuffer;d=bt(vt(s),c);let n=o.jsepRegisterBuffer;if(!n)throw Error(`Tensor location "gpu-buffer" is not supported without using WebGPU.`);u=n(r,i,t,d)}else if(l===`ml-tensor`){let t=e[2].mlTensor;d=bt(vt(s),c);let n=o.jsepRegisterMLTensor;if(!n)throw Error(`Tensor location "ml-tensor" is not supported without using WebNN.`);u=n(t,vt(s),c)}else{let t=e[2];if(Array.isArray(t)){d=4*t.length,u=o._malloc(d),n.push(u);let e=u/4;for(let r=0;r<t.length;r++){if(typeof t[r]!=`string`)throw TypeError(`tensor data at index ${r} is not a string`);o.HEAPU32[e++]=I(t[r],n)}}else d=t.byteLength,u=o._malloc(d),n.push(u),o.HEAPU8.set(new Uint8Array(t.buffer,t.byteOffset,d),u)}let f=o.stackSave(),p=o.stackAlloc(4*c.length);try{let e=p/4;c.forEach(t=>o.HEAP32[e++]=t);let n=o._OrtCreateTensor(vt(s),u,d,p,c.length,Tt(l));n===0&&L(`Can't create tensor for input/output. session=${r}, index=${i}.`),t.push(n)}finally{o.stackRestore(f)}},su=async(e,t,n,r,i,a)=>{let o=F(),s=tu.get(e);if(!s)throw Error(`cannot run inference. invalid session id: ${e}`);let c=s[0],l=s[1],u=s[2],d=s[3],f=s[4],p=s[5],m=t.length,h=r.length,g=0,_=[],v=[],y=[],b=[],x=o.stackSave(),S=o.stackAlloc(m*4),C=o.stackAlloc(m*4),w=o.stackAlloc(h*4),T=o.stackAlloc(h*4);try{o.jsepOnRunStart?.(c),[g,_]=ut(a);for(let r=0;r<m;r++)ou(n[r],v,b,e,t[r],f);for(let t=0;t<h;t++)ou(i[t],y,b,e,m+r[t],f);let s=S/4,x=C/4,E=w/4,D=T/4;for(let e=0;e<m;e++)o.HEAPU32[s++]=v[e],o.HEAPU32[x++]=l[t[e]];for(let e=0;e<h;e++)o.HEAPU32[E++]=y[e],o.HEAPU32[D++]=u[r[e]];if(d&&!p){let{handle:n,outputPreferredLocations:a,outputPreferredLocationsEncoded:s}=d;if(l.length!==m)throw Error(`input count from feeds (${m}) is expected to be always equal to model's input count (${l.length}).`);for(let r=0;r<m;r++){let i=t[r];await o._OrtBindInput(n,l[i],v[r])!==0&&L(`Can't bind input[${r}] for session=${e}.`)}for(let t=0;t<h;t++){let c=r[t];i[t]?.[3]?o._OrtBindOutput(n,u[c],y[t],0)!==0&&L(`Can't bind pre-allocated output[${t}] for session=${e}.`):o._OrtBindOutput(n,u[c],0,s[c])!==0&&L(`Can't bind output[${t}] to ${a[t]} for session=${e}.`)}tu.set(e,[c,l,u,d,f,!0])}let O;O=d?await o._OrtRunWithBinding(c,d.handle,h,w,g):await o._OrtRun(c,C,S,m,T,h,w,g),O!==0&&L(`failed to call OrtRun().`);let k=[];for(let e=0;e<h;e++){let t=o.HEAPU32[w/4+e];if(t===y[e]){k.push(i[e]);continue}let n=o.stackSave(),a=o.stackAlloc(16),s=!1,c,l=0;try{o._OrtGetTensorData(t,a,a+4,a+8,a+12)!==0&&L(`Can't access output tensor data on index ${e}.`);let n=a/4,i=o.HEAPU32[n++];l=o.HEAPU32[n++];let u=o.HEAPU32[n++],f=o.HEAPU32[n++],p=[];for(let e=0;e<f;e++)p.push(o.HEAPU32[u/4+e]);o._OrtFree(u);let m=p.reduce((e,t)=>e*t,1);c=yt(i);let h=d?.outputPreferredLocations[r[e]];if(c===`string`){if(h===`gpu-buffer`||h===`ml-tensor`)throw Error(`String tensor is not supported on GPU.`);let e=[],t=l/4;for(let n=0;n<m;n++){let r=o.HEAPU32[t++],i=n===m-1?void 0:o.HEAPU32[t]-r;e.push(o.UTF8ToString(r,i))}k.push([c,p,e,`cpu`])}else if(h===`gpu-buffer`&&m>0){let e=o.jsepGetBuffer;if(!e)throw Error(`preferredLocation "gpu-buffer" is not supported without using WebGPU.`);let n=e(l),r=bt(i,m);if(r===void 0||!Ct(c))throw Error(`Unsupported data type: ${c}`);s=!0,k.push([c,p,{gpuBuffer:n,download:o.jsepCreateDownloader(n,r,c),dispose:()=>{o._OrtReleaseTensor(t)}},`gpu-buffer`])}else if(h===`ml-tensor`&&m>0){let e=o.jsepEnsureTensor;if(!e)throw Error(`preferredLocation "ml-tensor" is not supported without using WebNN.`);if(bt(i,m)===void 0||!wt(c))throw Error(`Unsupported data type: ${c}`);let n=await e(l,i,p,!1);s=!0,k.push([c,p,{mlTensor:n,download:o.jsepCreateMLTensorDownloader(l,c),dispose:()=>{o.jsepReleaseTensorId(l),o._OrtReleaseTensor(t)}},`ml-tensor`])}else{let e=new(xt(c))(m);new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(o.HEAPU8.subarray(l,l+e.byteLength)),k.push([c,p,e,`cpu`])}}finally{o.stackRestore(n),c===`string`&&l&&o._free(l),s||o._OrtReleaseTensor(t)}}return d&&!f&&(o._OrtClearBoundOutputs(d.handle),tu.set(e,[c,l,u,d,f,!1])),k}finally{o.stackRestore(x),v.forEach(e=>o._OrtReleaseTensor(e)),y.forEach(e=>o._OrtReleaseTensor(e)),b.forEach(e=>o._free(e)),g!==0&&o._OrtReleaseRunOptions(g),_.forEach(e=>o._free(e))}},cu=e=>{let t=F(),n=tu.get(e);if(!n)throw Error(`invalid session id`);let r=n[0],i=t._OrtEndProfiling(r);i===0&&L(`Can't get an profile file name.`),t._OrtFree(i)},lu=e=>{let t=[];for(let n of e){let e=n[2];!Array.isArray(e)&&`buffer`in e&&t.push(e.buffer)}return t}}),du,fu,pu,mu,hu,gu,_u,vu,yu,bu,xu,Su,Cu,wu,Tu,Eu,Du,Ou,ku=l(()=>{Pe(),uu(),st(),et(),du=()=>!!T.wasm.proxy&&typeof document<`u`,pu=!1,mu=!1,hu=!1,vu=new Map,yu=(e,t)=>{let n=vu.get(e);n?n.push(t):vu.set(e,[t])},bu=()=>{if(pu||!mu||hu||!fu)throw Error(`worker not ready`)},xu=e=>{switch(e.data.type){case`init-wasm`:pu=!1,e.data.err?(hu=!0,_u[1](e.data.err)):(mu=!0,_u[0]()),gu&&=(URL.revokeObjectURL(gu),void 0);break;case`init-ep`:case`copy-from`:case`create`:case`release`:case`run`:case`end-profiling`:{let t=vu.get(e.data.type);e.data.err?t.shift()[1](e.data.err):t.shift()[0](e.data.out);break}default:}},Su=async()=>{if(!mu){if(pu)throw Error(`multiple calls to 'initWasm()' detected.`);if(hu)throw Error(`previous call to 'initWasm()' failed.`);if(pu=!0,du())return new Promise((e,t)=>{fu?.terminate(),Ze().then(([n,r])=>{try{fu=r,fu.onerror=e=>t(e),fu.onmessage=xu,_u=[e,t];let i={type:`init-wasm`,in:T};fu.postMessage(i),gu=n}catch(e){t(e)}},t)});try{await ot(T.wasm),await $l(T),mu=!0}catch(e){throw hu=!0,e}finally{pu=!1}}},Cu=async e=>{if(du())return bu(),new Promise((t,n)=>{yu(`init-ep`,[t,n]);let r={type:`init-ep`,in:{epName:e,env:T}};fu.postMessage(r)});await eu(T,e)},wu=async e=>du()?(bu(),new Promise((t,n)=>{yu(`copy-from`,[t,n]);let r={type:`copy-from`,in:{buffer:e}};fu.postMessage(r,[e.buffer])})):ru(e),Tu=async(e,t)=>{if(du()){if(t?.preferredOutputLocation)throw Error(`session option "preferredOutputLocation" is not supported for proxy.`);return bu(),new Promise((n,r)=>{yu(`create`,[n,r]);let i={type:`create`,in:{model:e,options:{...t}}},a=[];e instanceof Uint8Array&&a.push(e.buffer),fu.postMessage(i,a)})}else return iu(e,t)},Eu=async e=>{if(du())return bu(),new Promise((t,n)=>{yu(`release`,[t,n]);let r={type:`release`,in:e};fu.postMessage(r)});au(e)},Du=async(e,t,n,r,i,a)=>{if(du()){if(n.some(e=>e[3]!==`cpu`))throw Error(`input tensor on GPU is not supported for proxy.`);if(i.some(e=>e))throw Error(`pre-allocated output tensor is not supported for proxy.`);return bu(),new Promise((i,o)=>{yu(`run`,[i,o]);let s=n,c={type:`run`,in:{sessionId:e,inputIndices:t,inputs:s,outputIndices:r,options:a}};fu.postMessage(c,lu(s))})}else return su(e,t,n,r,i,a)},Ou=async e=>{if(du())return bu(),new Promise((t,n)=>{yu(`end-profiling`,[t,n]);let r={type:`end-profiling`,in:e};fu.postMessage(r)});cu(e)}}),Au,ju,Mu,Nu=l(()=>{Pe(),ku(),R(),Fe(),Dt(),Au=(e,t)=>{switch(e.location){case`cpu`:return[e.type,e.dims,e.data,`cpu`];case`gpu-buffer`:return[e.type,e.dims,{gpuBuffer:e.gpuBuffer},`gpu-buffer`];case`ml-tensor`:return[e.type,e.dims,{mlTensor:e.mlTensor},`ml-tensor`];default:throw Error(`invalid data location: ${e.location} for ${t()}`)}},ju=e=>{switch(e[3]){case`cpu`:return new M(e[0],e[2],e[1]);case`gpu-buffer`:{let t=e[0];if(!Ct(t))throw Error(`not supported data type: ${t} for deserializing GPU tensor`);let{gpuBuffer:n,download:r,dispose:i}=e[2];return M.fromGpuBuffer(n,{dataType:t,dims:e[1],download:r,dispose:i})}case`ml-tensor`:{let t=e[0];if(!wt(t))throw Error(`not supported data type: ${t} for deserializing MLTensor tensor`);let{mlTensor:n,download:r,dispose:i}=e[2];return M.fromMLTensor(n,{dataType:t,dims:e[1],download:r,dispose:i})}default:throw Error(`invalid data location: ${e[3]}`)}},Mu=class{async fetchModelAndCopyToWasmMemory(e){return wu(await Et(e))}async loadModel(e,t){ve();let n;n=typeof e==`string`?await this.fetchModelAndCopyToWasmMemory(e):e,[this.sessionId,this.inputNames,this.outputNames]=await Tu(n,t),ye()}async dispose(){return Eu(this.sessionId)}async run(e,t,n){ve();let r=[],i=[];Object.entries(e).forEach(e=>{let t=e[0],n=e[1],a=this.inputNames.indexOf(t);if(a===-1)throw Error(`invalid input '${t}'`);r.push(n),i.push(a)});let a=[],o=[];Object.entries(t).forEach(e=>{let t=e[0],n=e[1],r=this.outputNames.indexOf(t);if(r===-1)throw Error(`invalid output '${t}'`);a.push(n),o.push(r)});let s=r.map((e,t)=>Au(e,()=>`input "${this.inputNames[i[t]]}"`)),c=a.map((e,t)=>e?Au(e,()=>`output "${this.outputNames[o[t]]}"`):null),l=await Du(this.sessionId,i,s,o,c,n),u={};for(let e=0;e<l.length;e++)u[this.outputNames[o[e]]]=a[e]??ju(l[e]);return ye(),u}startProfiling(){}endProfiling(){Ou(this.sessionId)}}}),Pu={};u(Pu,{OnnxruntimeWebAssemblyBackend:()=>Iu,initializeFlags:()=>Fu,wasmBackend:()=>Lu});var Fu,Iu,Lu,Ru=l(()=>{Pe(),ku(),Nu(),et(),Fu=()=>{if((typeof T.wasm.initTimeout!=`number`||T.wasm.initTimeout<0)&&(T.wasm.initTimeout=0),T.wasm.simd===!1&&console.warn(`Deprecated property "env.wasm.simd" is set to false. non-SIMD build is no longer provided, and this setting will be ignored.`),typeof T.wasm.proxy!=`boolean`&&(T.wasm.proxy=!1),typeof T.wasm.trace!=`boolean`&&(T.wasm.trace=!1),typeof T.wasm.numThreads!=`number`||!Number.isInteger(T.wasm.numThreads)||T.wasm.numThreads<=0)if(typeof self<`u`&&!self.crossOriginIsolated)T.wasm.numThreads=1;else{let e=typeof navigator>`u`?c(`node:os`).cpus().length:navigator.hardwareConcurrency;T.wasm.numThreads=Math.min(4,Math.ceil((e||1)/2))}},Iu=class{async init(e){Fu(),await Su(),await Cu(e)}async createInferenceSessionHandler(e,t){let n=new Mu;return await n.loadModel(e,t),Promise.resolve(n)}},Lu=new Iu});Pe(),Pe(),Pe();var zu=`1.20.1`,Bu=N;{let e=(Ru(),f(Pu)).wasmBackend;h(`webgpu`,e,5),h(`webnn`,e,5),h(`cpu`,e,10),h(`wasm`,e,10)}Object.defineProperty(T.versions,`web`,{value:zu,enumerable:!0});function Vu(){return{cond:new Map,noncond:new Map}}function Hu(e){return e.cond.size===0&&e.noncond.size===0}function Uu(e,t,n,r){if(e.cond.size===0)return null;let i=[];for(let[t,n]of e.cond)i.push({e:n,slot:0,f:t});for(let r=6;r>0;r--){let a=n?t+r:t-r,o=e.noncond.get(a);o&&i.push({e:o,slot:r,f:a})}let a=i.length*512*64,o=new Float32Array(a),s=new Float32Array(a);i.forEach(({e,slot:t},n)=>{let i=n*512*64;o.set(e.mem,i);let a=((t-1)%7+7)%7;for(let t=0;t<512;t++){let n=i+t*64;for(let i=0;i<64;i++)s[n+i]=e.pos[t*64+i]+r[a*64+i]}});let c=[];for(let[r,i]of e.cond)(n?r>=t:r<=t)&&c.push({e:i,f:r});for(let r=1;r<16;r++){let i=n?t+r:t-r;if(i<0)break;let a=e.noncond.get(i);a&&c.push({e:a,f:i})}let l=new Float32Array(c.length*256);return c.forEach(({e},t)=>l.set(e.ptr,t*256)),{spatial:o,spatialPos:s,spatialLen:i.length*512,pointer:l,pointerPos:new Float32Array(l.length),pointerLen:c.length*(256/64),spatialFrames:i.map(e=>e.f),pointerFrames:c.map(e=>e.f)}}function Wu(e,t,n,r){(r?e.cond:e.noncond).set(t,n)}function Gu(e,t,n){for(let r of[...e.noncond.keys()])(n?r-t>=16:t-r>=16)&&e.noncond.delete(r)}const Ku=[`vision_encoder`,`mask_decoder`,`memory_attention`,`memory_encoder`],qu=[.485,.456,.406],Ju=[.229,.224,.225];var Yu=class e{feats=null;banks=new Map;noMem;tpos;pixels=new Float32Array(3*1024*1024);ort;s;ep;constructor(e,t,n,r){this.ort=e,this.s=t,this.ep=r,this.noMem=Float32Array.from(n.no_memory_embedding),this.tpos=Float32Array.from(n.memory_temporal_positional_encoding.flat())}static async create(t,n,r,i,a=[]){let o=null;for(let s of i)try{let i={};for(let e of Ku)i[e]=await t.InferenceSession.create(n[e],{executionProviders:[s],graphOptimizationLevel:`all`});return new e(t,i,r,s)}catch(e){o=e,a.push(`${s}: ${e instanceof Error?e.message:String(e)}`.slice(0,300))}throw o??Error(`no execution provider`)}async encode(e){let t=1024*1024,n=this.pixels;for(let r=0;r<t;r++)n[r]=(e[r*4]/255-qu[0])/Ju[0],n[t+r]=(e[r*4+1]/255-qu[1])/Ju[1],n[2*t+r]=(e[r*4+2]/255-qu[2])/Ju[2];this.dispose();let r=await this.s.vision_encoder.run({pixel_values:new this.ort.Tensor(`float32`,n,[1,3,1024,1024])});this.feats={f0:r.feats0,f1:r.feats1,f2:r.feats2,p2:r.pos2},r.pos0?.dispose?.(),r.pos1?.dispose?.()}dispose(){if(this.feats){for(let e of Object.values(this.feats))e.dispose?.();this.feats=null}}drop(e){this.banks.delete(e)}async step(e,t,n,r,i){let a=this.feats;if(!a)throw Error(`encode first`);let o=this.ort,s=this.banks.get(e);s||this.banks.set(e,s=Vu());let c=!!n&&Hu(s),l=await a.f2.getData(),u;if(c){u=new Float32Array(l.length);for(let e=0;e<256;e++)for(let t=0;t<4096;t++)u[e*4096+t]=l[e*4096+t]+this.noMem[e]}else{let e=Uu(s,t,i,this.tpos);if(!e)throw Error(`no conditioning frame`);u=await this.attend(l,await a.p2.getData(),e)}let d=n??[[0,0]],f=r??[-1],p=await this.s.mask_decoder.run({feats0:a.f0,feats1:a.f1,feats2:new o.Tensor(`float32`,u,[1,256,64,64]),input_points:new o.Tensor(`float32`,Float32Array.from(d.flat()),[1,1,d.length,2]),input_labels:new o.Tensor(`int32`,Int32Array.from(f),[1,1,f.length])}),m=await this.s.memory_encoder.run({vision_features:a.f2,pred_masks_high_res:p.high_res_masks.reshape([1,1,1024,1024]),is_mask_from_pts:new o.Tensor(`bool`,Uint8Array.from([+!!n]),[1])}),h=(await p.object_score_logits.getData())[0],g=await p.iou_scores.getData();Wu(s,t,{mem:(await m.memory_tokens.getData()).slice(),pos:(await m.memory_pos_enc.getData()).slice(),ptr:(await p.object_pointer.getData()).slice(),score:h},c),Gu(s,t,i);let _=p.pred_masks.dims,v=(await p.pred_masks.getData()).slice(0,_[_.length-1]*_[_.length-2]);for(let e of[...Object.values(p),...Object.values(m)])e.dispose?.();return{logits:v,lw:_[_.length-1],lh:_[_.length-2],score:h,iou:Math.max(...g)}}async attend(e,t,n){let r=this.ort,i=e=>{let t=new Float32Array(4096*256);for(let n=0;n<256;n++)for(let r=0;r<4096;r++)t[r*256+n]=e[n*4096+r];return t},a=await this.s.memory_attention.run({current_vision_features:new r.Tensor(`float32`,i(e),[4096,1,256]),current_vision_position_embeddings:new r.Tensor(`float32`,i(t),[4096,1,256]),spatial_memory:new r.Tensor(`float32`,n.spatial,[n.spatialLen,1,64]),spatial_memory_position_embeddings:new r.Tensor(`float32`,n.spatialPos,[n.spatialLen,1,64]),pointer_memory:new r.Tensor(`float32`,n.pointer,[n.pointerLen,1,64]),pointer_memory_position_embeddings:new r.Tensor(`float32`,n.pointerPos,[n.pointerLen,1,64])}),o=await a.conditioned_features.getData();a.conditioned_features.dispose?.();let s=new Float32Array(256*4096);for(let e=0;e<4096;e++)for(let t=0;t<256;t++)s[t*4096+e]=o[e*256+t];return s}};let Xu=null;async function Zu(){let e=navigator.gpu;if(!e)return{ok:!1,f16:!1};try{let t=await e.requestAdapter();return{ok:!!t,f16:!!t?.features.has(`shader-f16`)}}catch{return{ok:!1,f16:!1}}}self.name!==`em-pthread`&&(self.onmessage=async e=>{let t=e.data,n=(e,n=[])=>self.postMessage({id:t.id,...e},n);try{if(t.type===`init`){T.wasm.numThreads=t.threads,T.logLevel=`error`;let e=t.prefer===`wasm`?{ok:!1,f16:!1}:await Zu(),i=e.ok?[`webgpu`,`wasm`]:[`wasm`],a=Object.fromEntries(Object.entries(t.models).map(([e,t])=>[e,new Uint8Array(t)])),o=[];Xu=await Yu.create(r,a,t.bank,i,o),n({ok:!0,ep:Xu.ep,tried:i,failed:o,webgpu:e.ok,f16:e.f16,threads:T.wasm.numThreads,coi:typeof crossOriginIsolated<`u`&&crossOriginIsolated})}else if(!Xu)throw Error(`not initialised`);else if(t.type===`encode`)await Xu.encode(new Uint8ClampedArray(t.rgba)),n({ok:!0});else if(t.type===`step`){let e=await Xu.step(t.key,t.frame,t.points,t.labels,t.reverse);n({ok:!0,...e},[e.logits.buffer])}else t.type===`drop`&&(Xu.drop(t.key),n({ok:!0}))}catch(e){n({error:e instanceof Error?e.message:String(e)})}});