export function planningBackendOrigin(configured:string|undefined,onVercel:boolean,demoOrigin:string):string {
  const candidate=configured?.trim();
  const local='http://127.0.0.1:8000';
  if(candidate) {
    const url=new URL(candidate);
    const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/') {
      throw new Error('PLANNING_API_URL must be an HTTP(S) origin without a path or credentials.');
    }
    if(!onVercel||!loopback) {
      if(onVercel&&url.protocol!=='https:')throw new Error('The deployed planning backend must use HTTPS.');
      return url.origin;
    }
  }
  if(!onVercel)return local;
  const demo=new URL(demoOrigin);
  if(demo.protocol!=='https:'||!demo.hostname.endsWith('.trycloudflare.com')||demo.pathname!=='/'||demo.username||demo.password||demo.search||demo.hash) {
    throw new Error('A valid hosted planning backend is required for deployment.');
  }
  return demo.origin;
}
