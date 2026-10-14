# Publication copy; original script SHA256: 4392834d083fc84d903ae6e544673e98463a5850a7678679da99bc8fbfb12532
# Only the disposable local database URL is redacted to an environment reference.
import subprocess,os,time,base64,json,hmac,hashlib,secrets
secret=secrets.token_hex(32)
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
body=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':'service_role','iss':'supabase','exp':int(time.time())+3600})
token=body+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')
env=os.environ.copy();env.update(PGRST_DB_URI=os.environ["WS022_DISPOSABLE_DB_URL"],PGRST_DB_SCHEMAS='public',PGRST_DB_ANON_ROLE='anon',PGRST_JWT_SECRET=secret)
import urllib.request
for i in range(60):
 try:
  urllib.request.urlopen('http://127.0.0.1:56821/',timeout=2);break
 except Exception:time.sleep(1)
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import threading,urllib.error
class Proxy(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def forward(self):
  data=self.rfile.read(int(self.headers.get('Content-Length','0'))) or None
  path=self.path.removeprefix('/rest/v1')
  req=urllib.request.Request('http://127.0.0.1:56821'+path,data=data,method=self.command,headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')})
  try:r=urllib.request.urlopen(req,timeout=30)
  except urllib.error.HTTPError as e:r=e
  self.send_response(r.status)
  for k,v in r.headers.items():
   if k.lower() not in ('transfer-encoding','connection'):self.send_header(k,v)
  self.end_headers();self.wfile.write(r.read())
 do_GET=do_POST=do_PATCH=do_DELETE=do_PUT=forward
server=ThreadingHTTPServer(('127.0.0.1',56820),Proxy)
threading.Thread(target=server.serve_forever,daemon=True).start()
# Sign using original ephemeral secret cannot recover; launch new PostgREST with current secret.
subprocess.run(['docker','rm','--force','ws022-remaining-rest-20261014'],check=True,stdout=subprocess.DEVNULL)
restenv=os.environ.copy();restenv.update(PGRST_DB_URI=os.environ["WS022_DISPOSABLE_DB_URL"],PGRST_DB_SCHEMAS='public',PGRST_DB_ANON_ROLE='anon',PGRST_JWT_SECRET=secret)
subprocess.run(['docker','run','--detach','--name','ws022-remaining-rest-20261014','--publish','127.0.0.1:56821:3000','--env','PGRST_DB_URI','--env','PGRST_DB_SCHEMAS','--env','PGRST_DB_ANON_ROLE','--env','PGRST_JWT_SECRET','public.ecr.aws/supabase/postgrest:v14.14'],env=restenv,check=True,stdout=subprocess.DEVNULL)
for i in range(60):
 try:urllib.request.urlopen('http://127.0.0.1:56821/',timeout=2);break
 except Exception:time.sleep(1)
env=os.environ.copy();env.update(TKID_DATABASE_INTEGRATION_URL='http://127.0.0.1:56820',TKID_DATABASE_INTEGRATION_SERVICE_ROLE_KEY=token)
with open('/private/tmp/ws022-remaining-db/api-integration.log','w') as log:
 result=subprocess.run(['node','--import','tsx','--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--test','src/tkid-event-persistence.integration.test.ts'],cwd='/private/tmp/tracekit-ws022-recovery-20261014/api',env=env,stdout=log,stderr=subprocess.STDOUT)
if result.returncode == 0:
 with open('/private/tmp/ws022-remaining-db/api-full.log','w') as log:
  result=subprocess.run(['npm','test'],cwd='/private/tmp/tracekit-ws022-recovery-20261014/api',env=env,stdout=log,stderr=subprocess.STDOUT)
raise SystemExit(result.returncode)
