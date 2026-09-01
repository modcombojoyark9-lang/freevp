const $=s=>document.querySelector(s);
const input=$("#fileInput"), drop=$("#dropzone"), name=$("#fileName"), result=$("#result");
function handle(file){
  if(!file)return;
  name.textContent=`✓ ${file.name} — ${(file.size/1024/1024).toFixed(2)} MB`;
  const fakeId=Math.random().toString(36).slice(2,8);
  const link=`https://pack.example.com/p/${fakeId}/${encodeURIComponent(file.name)}`;
  $("#directLink").value=link;
  $("#serverConfig").textContent=`resource-pack=${link}\nrequire-resource-pack=true`;
  result.classList.remove("hidden");
  crypto.subtle.digest("SHA-1", file.arrayBuffer()).then(buf=>{
    $("#sha1").textContent=[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
  });
}
input.addEventListener("change",e=>handle(e.target.files[0]));
["dragenter","dragover"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.add("over")}));
["dragleave","drop"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.remove("over")}));
drop.addEventListener("drop",e=>handle(e.dataTransfer.files[0]));
$("#copyBtn").onclick=async()=>{await navigator.clipboard.writeText($("#directLink").value);$("#copyBtn").textContent="کپی شد ✓";setTimeout(()=>$("#copyBtn").textContent="کپی",1300)};
$("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.theme=document.body.classList.contains("light")?"light":"dark"};
if(localStorage.theme==="light")document.body.classList.add("light");
