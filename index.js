window.JAMBEACON_CONFIG = {
  supabaseUrl: 'https://mmkrwpftilyqduqtrppu.supabase.co',
  supabaseAnonKey: 'sb_publishable_U26allglM9TCiLI_igGAnw_v6Rs2oIS',
  environment: 'test'
};

(() => {
  const config = window.JAMBEACON_CONFIG || {};
  const wantsSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let client = null;
  let initPromise = null;
  function ensureClient(){
    if(!wantsSupabase) return Promise.resolve(null);
    if(client) return Promise.resolve(client);
    if(initPromise) return initPromise;
    initPromise = new Promise((resolve,reject)=>{
      const finish=()=>{ try{ client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey); window.JBBackend.mode='supabase'; resolve(client); }catch(e){reject(e);} };
      if(window.supabase?.createClient){finish();return;}
      const script=document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; script.async=true; script.onload=finish; script.onerror=()=>reject(new Error('Could not load Supabase client')); document.head.appendChild(script);
    });
    return initPromise;
  }
  const LS = 'jb-backend-demo-v2';

  const clone = v => JSON.parse(JSON.stringify(v));
  const seed = {
    user: null,
    profiles: [],
    jamRequests: [],
    messages: [],
    sessions: [],
    collaborations: [],
    beacons: [],
    blocks: [],
    reports: [],
    deletionRequests: []
  };

  function readLocal() {
    try { return {...seed, ...(JSON.parse(localStorage.getItem(LS) || '{}'))}; }
    catch { return clone(seed); }
  }
  function writeLocal(db) { localStorage.setItem(LS, JSON.stringify(db)); }
  function uid() { return 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function approxPoint(latitude, longitude) {
    const latMiles = 69;
    const lngMiles = Math.max(15, 69 * Math.cos(latitude * Math.PI / 180));
    const cell = 5;
    const north = latitude * latMiles;
    const east = longitude * lngMiles;
    return {
      latitude: (Math.floor(north / cell) * cell + cell / 2) / latMiles,
      longitude: (Math.floor(east / cell) * cell + cell / 2) / lngMiles,
      privacyRadiusMiles: 5
    };
  }

  async function signUp(email, password, metadata={}) {
    const c=await ensureClient();
    if (c) return c.auth.signUp({email, password, options:{data:metadata}});
    const db = readLocal();
    db.user = {id: uid(), email, user_metadata: metadata};
    writeLocal(db);
    return {data:{user:db.user, session:{user:db.user}}, error:null};
  }
  async function signIn(email, password) {
    const c=await ensureClient();
    if (c) return c.auth.signInWithPassword({email, password});
    const db = readLocal();
    db.user = db.user || {id:uid(), email, user_metadata:{}};
    db.user.email = email;
    writeLocal(db);
    return {data:{user:db.user, session:{user:db.user}}, error:null};
  }
  async function signOut() {
    const c=await ensureClient();
    if (c) return c.auth.signOut();
    const db = readLocal(); db.user = null; writeLocal(db); return {error:null};
  }
  async function getSession() {
    const c=await ensureClient();
    if (c) return c.auth.getSession();
    const db = readLocal();
    return {data:{session:db.user ? {user:db.user} : null}, error:null};
  }
  async function getMyProfile() {
    const c=await ensureClient();
    if(c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:null}; return c.from('profiles').select('*').eq('id',user.id).maybeSingle(); }
    const db=readLocal(); const id=db.user?.id; return {data:id?db.profiles.find(p=>p.id===id)||null:null,error:null};
  }
  async function listProfiles() {
    const c=await ensureClient();
    if(c) return c.from('profiles').select('id,display_name,instrument,genre,area,avatar_url,about,looking_for').order('updated_at',{ascending:false}).limit(100);
    return {data:readLocal().profiles,error:null};
  }
  async function listBeacons() {
    const c=await ensureClient();
    if(c) return c.from('beacons').select('user_id,active,public_latitude,public_longitude,privacy_radius_miles,updated_at').eq('active',true);
    return {data:readLocal().beacons.filter(b=>b.active),error:null};
  }

  async function saveProfile(profile) {
    const c=await ensureClient();
    if (c) {
      const {data:{user}} = await c.auth.getUser();
      if (!user) return {data:null,error:new Error('Sign in required')};
      return c.from('profiles').upsert({id:user.id,...profile,updated_at:new Date().toISOString()}).select().single();
    }
    const db=readLocal();
    const owner=db.user?.id || 'local-preview';
    const row={id:owner,...profile,updated_at:new Date().toISOString()};
    const ix=db.profiles.findIndex(p=>p.id===owner);
    if(ix>=0) db.profiles[ix]=row; else db.profiles.push(row);
    writeLocal(db); return {data:row,error:null};
  }
  async function setBeacon(latitude, longitude, active=true) {
    const c=await ensureClient();
    if (c) return c.rpc('set_my_beacon',{p_latitude:latitude,p_longitude:longitude,p_active:active});
    const db=readLocal(); const owner=db.user?.id || 'local-preview';
    const point=approxPoint(latitude,longitude);
    db.beacons=db.beacons.filter(b=>b.user_id!==owner);
    db.beacons.push({user_id:owner,active,public_latitude:point.latitude,public_longitude:point.longitude,privacy_radius_miles:5,updated_at:new Date().toISOString()});
    writeLocal(db); return {data:point,error:null};
  }
  async function disableBeacon() {
    const c=await ensureClient();
    if (c) return c.rpc('disable_my_beacon');
    const db=readLocal(); const owner=db.user?.id || 'local-preview';
    db.beacons=db.beacons.map(b=>b.user_id===owner?{...b,active:false}:b); writeLocal(db); return {error:null};
  }
  async function sendJamRequest(toUserId, note='') {
    const c=await ensureClient();
    if (c) {
      const {data:{user}}=await c.auth.getUser();
      if(!user) return {data:null,error:new Error('Sign in required')};
      return c.from('jam_requests').insert({from_user:user.id,to_user:toUserId,note,status:'pending'}).select().single();
    }
    const db=readLocal();
    const row={id:uid(),from_user:db.user?.id||'me',to_user:String(toUserId),note,status:'pending',created_at:new Date().toISOString()};
    db.jamRequests.unshift(row); writeLocal(db); return {data:row,error:null};
  }
  async function listJamRequests() {
    const c=await ensureClient();
    if (c) {
      const {data:{user}}=await c.auth.getUser();
      if(!user) return {data:[],error:null};
      return c.from('jam_requests').select('*').or(`from_user.eq.${user.id},to_user.eq.${user.id}`).order('created_at',{ascending:false});
    }
    return {data:readLocal().jamRequests,error:null};
  }
  async function respondJamRequest(id,status) {
    const c=await ensureClient();
    if (c) return c.from('jam_requests').update({status,responded_at:new Date().toISOString()}).eq('id',id).select().single();
    const db=readLocal(); const row=db.jamRequests.find(r=>r.id===id); if(row){row.status=status;row.responded_at=new Date().toISOString();} writeLocal(db); return {data:row,error:null};
  }
  async function sendMessage(threadId, body) {
    const c=await ensureClient();
    if (c) {
      const {data:{user}}=await c.auth.getUser();
      if(!user) return {data:null,error:new Error('Sign in required')};
      return c.from('messages').insert({thread_id:threadId,sender_id:user.id,body}).select().single();
    }
    const db=readLocal(); const row={id:uid(),thread_id:threadId,sender_id:db.user?.id||'me',body,created_at:new Date().toISOString()}; db.messages.push(row); writeLocal(db); return {data:row,error:null};
  }
  async function listMessages(threadId) {
    const c=await ensureClient();
    if (c) return c.from('messages').select('*').eq('thread_id',threadId).order('created_at',{ascending:true});
    return {data:readLocal().messages.filter(m=>m.thread_id===threadId),error:null};
  }
  async function listSessions() {
    const c=await ensureClient();
    if(c) return c.from('sessions').select('id,created_by,title,starts_at,general_area,need,remote_ok,created_at').order('starts_at',{ascending:true}).limit(100);
    return {data:readLocal().sessions,error:null};
  }
  async function createSession(record) {
    const c=await ensureClient();
    if(c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:new Error('Sign in required')}; return c.from('sessions').insert({created_by:user.id,...record}).select().single(); }
    const db=readLocal(); const row={id:uid(),created_by:db.user?.id||'me',...record,created_at:new Date().toISOString()}; db.sessions.unshift(row);writeLocal(db);return {data:row,error:null};
  }
  async function joinSession(sessionId) {
    const c=await ensureClient();
    if(c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:new Error('Sign in required')}; return c.from('session_members').upsert({session_id:sessionId,user_id:user.id,status:'joined'}).select().single(); }
    return {data:{session_id:sessionId,status:'joined'},error:null};
  }

  async function blockUser(blockedId) {
    const c=await ensureClient();
    if(c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:new Error('Sign in required')}; return c.from('blocks').upsert({blocker_id:user.id,blocked_id:blockedId}).select().single(); }
    const db=readLocal(); const blocker=db.user?.id||'me'; if(!db.blocks.some(b=>b.blocker_id===blocker&&String(b.blocked_id)===String(blockedId)))db.blocks.push({blocker_id:blocker,blocked_id:String(blockedId),created_at:new Date().toISOString()});writeLocal(db);return {data:true,error:null};
  }
  async function reportUser(reportedId, details='') {
    const c=await ensureClient();
    if(c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:new Error('Sign in required')}; return c.from('reports').insert({reporter_id:user.id,reported_user:reportedId,category:'safety',details}).select().single(); }
    const db=readLocal(); db.reports.push({id:uid(),reporter_id:db.user?.id||'me',reported_user:String(reportedId),category:'safety',details,created_at:new Date().toISOString()});writeLocal(db);return {data:true,error:null};
  }
  async function requestAccountDeletion() {
    const c=await ensureClient();
    if(c) return c.rpc('request_my_account_deletion');
    const db=readLocal(); const id=db.user?.id||'me'; db.deletionRequests.push({user_id:id,requested_at:new Date().toISOString(),status:'requested'}); db.user=null; writeLocal(db); return {data:true,error:null};
  }

  async function saveCollaboration(record) {
    const c=await ensureClient();
    if (c){ const {data:{user}}=await c.auth.getUser(); if(!user)return {data:null,error:new Error('Sign in required')}; return c.from('collaborations').upsert({created_by:user.id,...record}).select().single(); }
    const db=readLocal(); const row={id:record.id||uid(),...record,updated_at:new Date().toISOString()}; const ix=db.collaborations.findIndex(x=>x.id===row.id); if(ix>=0)db.collaborations[ix]=row;else db.collaborations.push(row);writeLocal(db);return {data:row,error:null};
  }

  window.JBBackend = {
    mode: wantsSupabase ? 'connecting' : 'local-demo', get client(){return client;},
    signUp, signIn, signOut, getSession, getMyProfile, listProfiles, listBeacons, saveProfile,
    setBeacon, disableBeacon, sendJamRequest, listJamRequests, respondJamRequest,
    sendMessage, listMessages, listSessions, createSession, joinSession, blockUser, reportUser, requestAccountDeletion, saveCollaboration, approxPoint
  };
})();

(() => {
  const BANDLAB_STUDIO = 'https://www.bandlab.com/studio';
  const BANDLAB_INVITE_HELP = 'https://help.bandlab.com/hc/en-us/articles/48010528581529-How-do-I-invite-other-users-to-collaborate';

  const musicians = [
    {id:1,name:'Maya R.',instrument:'Lead Guitar',secondary:'Vocals',genres:['Rock','Blues'],distance:1.2,status:'JAM NOW',match:96,x:24,y:30,collabs:14,about:'Big blues bends, loud amps, and riffs that leave room for everybody else.',lookingFor:'Drums + bass for a gritty two-guitar rock project.',influences:['Gary Clark Jr.','Heart','The Black Keys'],initials:'MR'},
    {id:2,name:'Dre V.',instrument:'Drums',genres:['Rock','Metal'],distance:2.4,status:'JAM NOW',match:93,x:70,y:24,collabs:21,about:'Hard-hitting drummer who likes tight arrangements more than endless solos.',lookingFor:'Guitar + bass players ready to finish songs, not just trade riffs.',influences:['Tool','Queens of the Stone Age','Royal Blood'],initials:'DV'},
    {id:3,name:'Nico S.',instrument:'Bass',genres:['Funk','Rock'],distance:3.1,status:'LATER',match:89,x:77,y:66,collabs:8,about:'Pocket-first bass player. Groove, restraint, then chaos when the song asks for it.',lookingFor:'A drummer and guitarist for weekly jams.',influences:['Flea','Vulfpeck','Rage Against the Machine'],initials:'NS'},
    {id:4,name:'Cass J.',instrument:'Vocals',secondary:'Rhythm Guitar',genres:['Country','Rock'],distance:4.7,status:'JAM NOW',match:91,x:38,y:72,collabs:17,about:'Southern-rock vocals, harmony stacks, and a rhythm guitar that stays out of the way.',lookingFor:'Players who want to turn one good hook into a finished song.',influences:['Chris Stapleton','Larkin Poe','Fleetwood Mac'],initials:'CJ'},
    {id:5,name:'Eli T.',instrument:'Keys',secondary:'Synth',genres:['Jazz','R&B'],distance:5.6,status:'OFFLINE',match:82,x:13,y:58,collabs:12,about:'Keys, synths, arrangement help, and the occasional completely unnecessary organ solo.',lookingFor:'Songwriters who need texture and arrangement help.',influences:['Stevie Wonder','Cory Henry','Hiatus Kaiyote'],initials:'ET'}
  ];

  const seedSessions = [
    {id:1,when:'TONIGHT • 8:00',title:'Garage Rock Song Build',place:'Spring • public rehearsal space',need:'Need: bass + vocals',members:3},
    {id:2,when:'FRIDAY • 9:30',title:'Heavy Riff Exchange',place:'Tomball • studio room',need:'Need: drummer',members:2},
    {id:3,when:'SUNDAY • 4:00',title:'Southern Rock Collab',place:'The Woodlands • music room',need:'Need: guitar + keys',members:4}
  ];

  const load = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const state = {
    page: 'Home',
    menu: false,
    access: localStorage.getItem('jb-access') === 'member' ? 'member' : 'preview',
    profile: load('jb-profile', {name:'',instrument:'Guitar',genre:'Rock',area:'North Houston'}),
    beaconOn: localStorage.getItem('jb-beacon') === 'on',
    publicPoint: load('jb-public-point', null),
    selected: 1,
    genre: 'All',
    invites: load('jb-invites', []),
    inbox: load('jb-inbox', [{id:'welcome-1',from:'Maya R.',fromId:'1',status:'pending',note:'Want to try a first-song jam this week?',createdAt:Date.now()}]),
    messages: load('jb-messages', {}),
    authEmail: localStorage.getItem('jb-auth-email') || '',
    blocked: load('jb-blocked', []),
    directory: [],
    sessions: load('jb-sessions', seedSessions),
    firstSong: load('jb-first-song', {partner:'Maya R.',starterInstrument:'Guitar',secondInstrument:'Drums',starterBeat:'Straight Rock • 110 BPM',duration:'3:00',projectLink:'',songLink:'',step:1}),
    bandlabProject: localStorage.getItem('jb-bandlab-project') || ''
  };

  const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const isBandLabUrl = url => /^https:\/\/(?:www\.)?bandlab\.com\//i.test((url || '').trim());
  const directory = () => window.JBBackend?.mode==='supabase' ? state.directory : (state.directory.length ? state.directory : musicians);
  const inviteSent = id => state.invites.some(v=>String(v)===String(id));
  const haversineMiles = (a,b) => {
    if(!a||!b) return null;
    const R=3958.8, rad=x=>x*Math.PI/180;
    const dLat=rad(b.latitude-a.latitude), dLon=rad(b.longitude-a.longitude);
    const q=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(q));
  };
  const radarPos = id => {
    let h=0; for(const ch of String(id)) h=((h<<5)-h+ch.charCodeAt(0))|0;
    return {x:12+Math.abs(h%72),y:16+Math.abs((h>>4)%66)};
  };
  async function refreshDirectory(){
    try{
      const [pr,br]=await Promise.all([window.JBBackend?.listProfiles?.(),window.JBBackend?.listBeacons?.()]);
      if(pr?.error) return;
      const profiles=pr?.data||[]; if(!profiles.length){state.directory=[]; if(window.JBBackend?.mode==='supabase')render(); return;}
      const beaconBy=new Map((br?.data||[]).map(b=>[String(b.user_id),b]));
      state.directory=profiles.filter(p=>!state.blocked.some(x=>String(x)===String(p.id))).map((p,i)=>{
        const b=beaconBy.get(String(p.id)); const pos=radarPos(p.id);
        const otherPoint=b?{latitude:b.public_latitude,longitude:b.public_longitude}:null;
        const dist=haversineMiles(state.publicPoint,otherPoint);
        const initials=(p.display_name||'JB').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
        return {id:String(p.id),name:p.display_name||'Musician',instrument:p.instrument||'Musician',genres:[p.genre||'Other'],distance:dist?Number(dist.toFixed(1)):null,status:b?.active?'JAM NOW':'OFFLINE',match:90-i%12,x:pos.x,y:pos.y,collabs:0,about:p.about||'Here to find musicians and make something together.',lookingFor:p.looking_for||'Looking for the right player to jam and build a song with.',influences:[],initials};
      });
      render();
    }catch(e){ console.warn('Directory refresh skipped',e); }
  }

  async function refreshAccount(){
    if(window.JBBackend?.mode==='local-demo') return;
    try{
      const sr=await window.JBBackend.getSession(); const session=sr?.data?.session; if(!session)return;
      state.authEmail=session.user?.email||state.authEmail;
      const pr=await window.JBBackend.getMyProfile();
      if(pr?.data){
        state.profile={name:pr.data.display_name||'',instrument:pr.data.instrument||'Guitar',genre:pr.data.genre||'Rock',area:pr.data.area||''};
        state.access=pr.data.membership==='member'?'member':'preview';
      }
      persist();render();
    }catch(e){console.warn('Account refresh skipped',e);}
  }
  async function refreshInbox(){
    if(window.JBBackend?.mode==='local-demo') return;
    try{
      const [rr,pr]=await Promise.all([window.JBBackend.listJamRequests(),window.JBBackend.listProfiles()]);
      if(rr?.error) return;
      const names=new Map((pr?.data||[]).map(p=>[String(p.id),p.display_name||'Musician']));
      const session=(await window.JBBackend.getSession())?.data?.session;
      const me=String(session?.user?.id||'');
      state.inbox=(rr?.data||[]).filter(r=>String(r.to_user)===me).map(r=>({id:String(r.id),from:names.get(String(r.from_user))||'Musician',fromId:String(r.from_user),status:r.status,note:r.note||'Jam request',createdAt:r.created_at}));
      state.invites=(rr?.data||[]).filter(r=>String(r.from_user)===me).map(r=>String(r.to_user));
      for(const row of state.inbox.filter(x=>x.status==='accepted').slice(0,3)){
        const mr=await window.JBBackend.listMessages(row.id); if(!mr?.error) state.messages[row.id]=(mr.data||[]).map(m=>({body:m.body,mine:String(m.sender_id)===me,at:m.created_at}));
      }
      persist(); render();
    }catch(e){console.warn('Inbox refresh skipped',e);}
  }
  async function refreshSessions(){
    if(window.JBBackend?.mode==='local-demo') return;
    try{
      const r=await window.JBBackend.listSessions(); if(r?.error)return; if(!r?.data?.length){state.sessions=[];persist();render();return;}
      state.sessions=r.data.map((x,i)=>({id:String(x.id),when:x.starts_at?new Date(x.starts_at).toLocaleString():'TIME TBD',title:x.title,place:x.general_area||'General area',need:x.need||'Open jam',members:1}));
      persist();render();
    }catch(e){console.warn('Session refresh skipped',e);}
  }

  function persist() {
    localStorage.setItem('jb-access', state.access);
    save('jb-profile', state.profile);
    localStorage.setItem('jb-beacon', state.beaconOn ? 'on' : 'off');
    save('jb-public-point', state.publicPoint);
    save('jb-invites', state.invites);
    save('jb-inbox', state.inbox);
    save('jb-messages', state.messages);
    localStorage.setItem('jb-auth-email', state.authEmail || '');
    save('jb-blocked', state.blocked);
    save('jb-sessions', state.sessions);
    save('jb-first-song', state.firstSong);
    localStorage.setItem('jb-bandlab-project', state.bandlabProject);
  }

  function go(page) {
    state.page = page;
    state.menu = false;
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function toast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = '⚡ ' + message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  function requireMember(action, message='That opens with the $9.99 JamBeacon membership.') {
    if (state.access !== 'member') { toast(message); go('Join'); return false; }
    action(); return true;
  }

  function header() {
    const nav = ['Home','Discover','Beacon','Inbox','Sessions','First Song','Studio'];
    return `<header class="topbar">
      <button class="brand" data-go="Home" aria-label="JamBeacon home"><span class="beacon-logo"><i></i><i></i><b>JB</b></span><span>JamBeacon<small>FIND PEOPLE. MAKE SONGS.</small></span></button>
      <nav class="nav ${state.menu ? 'open' : ''}">${nav.map(x=>`<button class="${state.page===x?'active':''}" data-go="${x}">${x}</button>`).join('')}</nav>
      <div class="header-actions"><span class="access-pill ${state.access==='member'?'member':''}">${state.access==='member'?'MEMBER':'FREE PREVIEW'}</span><button class="ghost" data-go="Profile">My Jam</button>${state.access==='preview'?'<button class="join-mini" data-go="Join">Unlock • $9.99</button>':''}<button class="menu" id="menuBtn" aria-label="Open menu">☰</button></div>
    </header>`;
  }

  function footer() {
    return `<footer><div class="footer-brand"><span class="beacon-logo small"><i></i><i></i><b>JB</b></span><b>JamBeacon</b></div><p>Built for musicians who want somebody to jam with—not another feed to shout into.</p><div class="footer-links"><button data-go="Discover">Browse musicians</button><button data-go="Inbox">Inbox</button><button data-go="First Song">First Song</button><button data-go="Studio">BandLab Studio</button><button data-go="Beacon">Beacon privacy</button><button data-go="Join">Membership</button></div><small>JamBeacon public beacons are intentionally approximate. Exact GPS belongs only in a trusted private matching layer and should never be exposed to another member.</small></footer>`;
  }

  const pageHead = (overline,title,text) => `<div class="page-head"><span>${overline}</span><h1>${title}</h1><p>${text}</p></div>`;

  function home() {
    return `<section class="home-hero"><div class="hero-noise"></div><div class="hero-copy"><span class="kicker"><i></i> THE LOCAL MUSIC NETWORK FOR ACTUAL JAMS</span><h1>Find your<br><em>missing player.</em></h1><p>See who's around. Find the sound you're missing. Connect, jam, and turn the first good idea into a <strong>song you made together.</strong></p><div class="hero-actions"><button class="cta acid" data-go="Discover">Browse the scene <span>↗</span></button><button class="cta outline" data-go="${state.access==='member'?'Beacon':'Join'}">${state.access==='member'?'Turn on my Beacon':'Unlock JamBeacon • $9.99'}</button></div><div class="micro-proof"><span>◎ Approximate map location</span><span>♬ Collaboration-first</span><span>⚡ Live jam status</span></div></div><div class="hero-orbit" aria-hidden="true"><div class="orbit-ring ring-a"></div><div class="orbit-ring ring-b"></div><div class="orbit-ring ring-c"></div><div class="core">JB<span>LIVE</span></div><div class="orbit-card card-a">GUITAR<b>1.2 MI</b></div><div class="orbit-card card-b">DRUMS<b>2.4 MI</b></div><div class="orbit-card card-c">VOCALS<b>4.7 MI</b></div></div></section>
    <section class="marquee"><div>FIND A PLAYER ✦ LIGHT YOUR BEACON ✦ SEND A JAM REQUEST ✦ MEET SAFELY ✦ OPEN BANDLAB ✦ BUILD A SONG ✦ CREDIT THE WHOLE COLLAB ✦ FIND A PLAYER ✦ LIGHT YOUR BEACON ✦ SEND A JAM REQUEST ✦ </div></section>
    <section class="mission split-section"><div><span class="section-num">01 / WHY JAMBEACON</span><h2>Less posting.<br>More playing.</h2></div><div class="mission-copy"><p>A profile tells people what you play. <strong>JamBeacon is designed around what happens after they find you.</strong> Signal that you're available, connect with a musician nearby, set up a jam, then use one shared recording workflow.</p><p>Solo clips can help somebody understand your sound, but the point of the app is to <em>make something with somebody else.</em></p></div></section>
    <section class="feature-grid core-grid"><button class="feature f1" data-go="Discover"><span>01</span><b>DISCOVER</b><h3>Find the missing piece.</h3><p>Browse instrument, sound, influences, goals and rough distance.</p><i>Browse profiles ↗</i></button><button class="feature f2" data-go="Beacon"><span>02</span><b>BEACON</b><h3>Signal when you're ready.</h3><p>Your public marker is approximate—not a pin dropped on your home.</p><i>See the beacon ↗</i></button><button class="feature f3" data-go="Sessions"><span>03</span><b>JAM SESSIONS</b><h3>Turn a match into a plan.</h3><p>Create a public-space jam and list what instruments you still need.</p><i>See sessions ↗</i></button><button class="feature f4" data-go="First Song"><span>04</span><b>FIRST SONG</b><h3>Don't let the riff die.</h3><p>Player A starts. Player B listens and answers. BandLab handles recording.</p><i>See the handoff ↗</i></button></section>
    <section class="membership-callout"><div><span>FREE TO LOOK AROUND</span><h2>See the scene<br><em>before you join it.</em></h2></div><div class="membership-stack"><p>Create a basic identity and browse musician pages for free. The $9.99 one-time unlock turns on the connection layer: live Beacon, nearby musicians, jam requests, sessions and the guided BandLab collaboration workflow.</p><button class="cta dark" data-go="Join">${state.access==='member'?"You're unlocked →":"See membership →"}</button></div></section>`;
  }

  function discover() {
    const genres=['All','Rock','Country','Metal','Blues','Funk','Jazz'];
    const people=directory();
    if(!people.length) return `<section class="page-wrap discover-page">${pageHead('DISCOVER','The JamBeacon directory is ready for real musicians.','This live backend does not have any musician profiles yet. Create the first account/profile, then additional testers will appear here instead of demo people.')}<div class="empty-state"><h3>No live musicians yet.</h3><p>Your test group will populate this screen as they create profiles.</p><button data-go="Join">CREATE MY PROFILE →</button></div></section>`;
    const shown=people.filter(m=>state.genre==='All'||m.genres.includes(state.genre));
    const selected=people.find(m=>String(m.id)===String(state.selected))||shown[0]||people[0];
    return `<section class="page-wrap discover-page">${pageHead('DISCOVER','Meet the scene before you hit send.','Free users can browse musician pages. Member tools—live nearby distance, Beacon visibility and jam requests—unlock for $9.99.')}
      <div class="filter-row">${genres.map(g=>`<button class="${state.genre===g?'active':''}" data-genre="${g}">${g}</button>`).join('')}</div>
      <div class="discover-layout"><div class="radar-map"><div class="privacy-ring ring1"></div><div class="privacy-ring ring2"></div><div class="privacy-ring ring3"></div><div class="scan-line"></div><div class="you-dot">YOU</div>${shown.filter(m=>m.status!=='OFFLINE').map(m=>`<button class="map-dot ${m.status==='JAM NOW'?'hot':''}" style="left:${m.x}%;top:${m.y}%" data-musician="${m.id}"><i></i><span>${state.access==='member'&&m.distance!=null?`${m.instrument} • ~${m.distance} mi`:m.instrument}</span></button>`).join('')}${state.access==='preview'?'<div class="map-lock"><b>LIVE DISTANCE LOCKED</b><span>You can browse the people. Membership unlocks the live nearby layer.</span><button data-go="Join">Unlock $9.99</button></div>':''}<div class="map-note">Approximate public positions • never exact home pins</div></div>
      <aside class="musician-card"><div class="profile-poster"><span>${selected.initials}</span><b>${selected.status}</b></div><div class="profile-top"><div><small>${selected.genres.join(' • ')}</small><h2>${selected.name}</h2><p>${selected.instrument}${selected.secondary?' + '+selected.secondary:''}</p></div><strong>${selected.match}<small>% MATCH</small></strong></div><p class="profile-about">${selected.about}</p><div class="profile-strip"><span><b>${selected.collabs}</b>collabs</span><span><b>${state.access==='member'&&selected.distance!=null?'~'+selected.distance:'••'}</b>miles</span><span><b>${selected.status==='JAM NOW'?'LIVE':'SET'}</b>status</span></div><div class="looking"><small>LOOKING FOR</small><p>${selected.lookingFor}</p></div><div class="influences">${selected.influences.length?selected.influences.map(i=>`<span>${i}</span>`).join(''):'<span>COLLAB-FIRST</span>'}</div><button class="wide-action" data-invite="${selected.id}">${inviteSent(selected.id)?'✓ JAM REQUEST SENT':state.access==='member'?'SEND JAM REQUEST →':'UNLOCK TO CONNECT • $9.99'}</button></aside></div>
      <div class="profile-rail">${shown.map(m=>`<button class="${selected.id===m.id?'active':''}" data-musician="${m.id}"><span>${m.initials}</span><div><b>${m.name}</b><small>${m.instrument} • ${m.genres[0]}</small></div><i>${m.status==='JAM NOW'?'●':'○'}</i></button>`).join('')}</div></section>`;
  }

  function beacon() {
    const point=state.publicPoint;
    return `<section class="page-wrap beacon-page">${pageHead('BEACON','Be findable without giving away your front door.','Your exact position is for private matching only. Other musicians should receive an intentionally coarse public Beacon within the privacy area.')}
      <div class="beacon-stage"><div class="signal-demo ${state.beaconOn?'on':''}"><div class="street-lines"><i></i><i></i><i></i><i></i></div><div class="signal-ring s1"></div><div class="signal-ring s2"></div><div class="signal-ring s3"></div><div class="signal-core">${state.beaconOn?'LIVE':'OFF'}<small>JB</small></div><span class="decoy a">PUBLIC POINT</span><span class="decoy b">~5 MI AREA</span><span class="decoy c">EXACT GPS HIDDEN</span></div>
      <div class="beacon-controls"><span class="status ${state.access==='member'?'member':''}">${state.access==='member'?'MEMBER ACCESS':'FREE PREVIEW'}</span><h2>${state.beaconOn?"You're signaling.":'Your Beacon is dark.'}</h2><p>${state.access==='member'?"When you're ready to jam, light up your approximate area. Turn it off whenever you're done.":'You can see how Beacon privacy works for free. Membership is required before your live status appears or you can see other live member Beacons.'}</p>${state.access==='member'?`<div class="beacon-buttons">${state.beaconOn?'<button class="cta danger" id="beaconOff">Turn Beacon off</button>':'<button class="cta acid" id="beaconOn">Use location + turn Beacon on</button>'}<button class="cta outline-dark" data-go="Discover">Find players</button></div>`:'<button class="cta acid" data-go="Join">Unlock Beacon • $9.99</button>'}<div class="privacy-card"><b>5-MILE PRIVACY DESIGN</b><p>The test build converts the device coordinate into a coarse public map cell. Production should perform this masking on the trusted backend so an exact coordinate is never placed in a public Beacon record.</p>${point?`<code>Public test point: ${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)} • privacy area ${point.privacyRadiusMiles} mi</code>`:''}</div></div></div></section>`;
  }

  function sessions() {
    return `<section class="page-wrap sessions-page">${pageHead('SESSIONS',"Turn 'we should jam sometime' into a time and place.",'Browse examples for free. Members can join, invite players and create sessions. First meetings should be in public or professional rehearsal spaces.')}
      <div class="session-list">${state.sessions.length ? state.sessions.map((s,i)=>`<article><span class="session-index">0${i+1}</span><div><small>${esc(s.when)}</small><h3>${esc(s.title)}</h3><p>${esc(s.place)}</p></div><div class="session-need"><b>${esc(s.need)}</b><span>${s.members} player${s.members===1?'':'s'} in</span></div><button data-session="${s.id}">${state.access==='member'?'REQUEST SPOT':'MEMBERS ONLY'}</button></article>`).join('') : '<div class="empty-state"><h3>No live sessions yet.</h3><p>Create the first jam when your test group is ready.</p></div>'}</div>
      <div class="create-session"><div><span>CREATE A JAM</span><h2>Put something<br>on the calendar.</h2><p>Don't publish a home address. Share exact meetup details privately after everybody accepts.</p></div><div class="session-form"><label>Session name<input id="sessionTitle" placeholder="Saturday riff lab"></label><label>When<input id="sessionWhen" value="SATURDAY • 7:00"></label><label>What are you missing?<input id="sessionNeed" value="Need: drummer"></label><button class="cta acid" id="createSession">${state.access==='member'?'Create session →':'Unlock to create • $9.99'}</button></div></div></section>`;
  }

  function firstSong() {
    const f=state.firstSong;
    const instruments=['Guitar','Bass','Drums','Keys','Vocals','Harmonica','Violin','Percussion','Other'];
    const presets=['Straight Rock • 110 BPM','Slow Blues • 78 BPM','Heavy Half-Time • 92 BPM','Funk Pocket • 104 BPM','Country Drive • 122 BPM','Free Tempo • no beat'];
    const opts=(arr,val)=>arr.map(x=>`<option ${x===val?'selected':''}>${x}</option>`).join('');
    return `<section class="page-wrap first-song-page">${pageHead('FIRST SONG','One person starts. The other person answers.',"JamBeacon's first collaboration is deliberately simple: use BandLab, leave room for each other, and turn the first connection into a real 2–4 minute song instead of another forgotten jam.")}
      <div class="tutorial-shell"><div class="tutorial-video tutorial-placeholder"><div style="padding:28px"><b style="display:block;font-size:1.05rem;margin-bottom:10px">JAMBEACON • CREATE YOUR FIRST SONG</b><p style="margin:0 0 14px">Player A starts a BandLab project with a simple beat or preset and records the first instrument. Player B listens first, then adds a different instrument based on what the song needs.</p><a href="https://help.bandlab.com/hc/en-us/articles/115002945153-Getting-Started-with-the-BandLab-Studio" target="_blank" rel="noopener" class="cta acid" style="display:inline-flex">OPEN BANDLAB START GUIDE →</a></div><div class="video-caption"><b>VIDEO GUIDE</b><span>The JamBeacon video asset will be added after the first live hosting test.</span></div></div><aside class="first-song-rule"><span>THE WHOLE IDEA</span><h2>Don't show off.<br><em>Leave a doorway.</em></h2><p>Player A lays down enough to give the song direction. Player B listens first, then adds a different instrument based on what the song actually needs.</p><div class="rule-pills"><b>2 PLAYERS MIN.</b><b>2 DIFFERENT INSTRUMENTS</b><b>2–4 MINUTES</b><b>BOTH CREDITED</b></div></aside></div>
      <div class="first-song-builder"><div class="builder-head"><div><span>YOUR FIRST COLLAB</span><h2>Build the handoff.</h2></div><strong>${Math.min(f.step,5)}/5</strong></div><div class="builder-grid"><label>Jam partner<input data-first="partner" value="${esc(f.partner)}" placeholder="Who are you making this with?"></label><label>Player A instrument<select data-first="starterInstrument">${opts(instruments,f.starterInstrument)}</select></label><label>Starter feel<select data-first="starterBeat">${opts(presets,f.starterBeat)}</select></label><label>Player B instrument<select data-first="secondInstrument">${opts(instruments.filter(x=>x!==f.starterInstrument),f.secondInstrument)}</select></label><label>Target song length<select data-first="duration">${opts(['2:00','2:30','3:00','3:30','4:00'],f.duration)}</select></label></div>
      <div class="handoff-flow"><article class="${f.step>=1?'done':''}"><b>01</b><div><span>PLAYER A</span><h3>Open BandLab + set the floor</h3><p>Use the selected feel as your guide. Add a simple BandLab beat/loop or tempo, then record ${esc(f.starterInstrument)}. Don't fill every space.</p></div><button data-first-action="open">${state.access==='member'?'OPEN BANDLAB ↗':'MEMBER STEP'}</button></article>
      <article class="${f.step>=2?'done':''}"><b>02</b><div><span>PLAYER A</span><h3>Save it + invite ${esc(f.partner||'your partner')}</h3><p>Use BandLab's collaborator invite/project link so Player B receives the same project—not a detached solo file.</p></div><button data-first-action="invite">I SENT THE INVITE</button></article>
      <article class="${f.step>=3?'done':''}"><b>03</b><div><span>PLAYER B</span><h3>Listen before touching record</h3><p>Hear Player A's part first. Then add ${esc(f.secondInstrument)} and answer what is already there. The second part should change the song, not bury the first player.</p></div><button data-first-action="second">SECOND PART RECORDED</button></article>
      <article class="${f.step>=4?'done':''}"><b>04</b><div><span>BOTH PLAYERS</span><h3>Shape it into ${esc(f.duration)}</h3><p>Arrange, trim and mix in BandLab until it feels like a song. Minimum target: two different instruments, one meaningful contribution from each player.</p></div><button data-first-action="ready">SONG IS READY</button></article>
      <article class="${f.step>=5&&f.songLink?'done':''}"><b>05</b><div><span>BRING IT BACK</span><h3>Attach the BandLab link to JamBeacon</h3><p>JamBeacon keeps the people, credits, session and song connected. BandLab remains the recording/mixing studio.</p><input data-first="songLink" value="${esc(f.songLink)}" placeholder="Paste BandLab song/project share link"></div><button data-first-action="save">SAVE FIRST SONG</button></article></div>
      <div class="project-link-box"><span>OPTIONAL WORKING PROJECT LINK</span><input data-first="projectLink" value="${esc(f.projectLink)}" placeholder="Paste the private BandLab collaboration link here"><small>Test build stores this only on this device. Production will store project references privately in the JamBeacon backend.</small></div></div></section>`;
  }

  function studio() {
    const safe=isBandLabUrl(state.bandlabProject);
    return `<section class="page-wrap studio-page">${pageHead('STUDIO','One recording room for everybody: BandLab.','JamBeacon handles discovery, sessions, credits and collaboration history. Recording, overdubs and mixing happen in BandLab so every member learns the same simple workflow.')}
      <div class="bandlab-hero"><div><span>JAMBEACON WORKFLOW</span><h2>Find here.<br>Record there.<br><em>Bring the song back.</em></h2><p>No second mixer to learn. No half-built JamBeacon DAW. When a collaboration reaches the recording stage, JamBeacon sends both musicians to BandLab.</p><div class="bandlab-actions"><a class="cta acid" href="${BANDLAB_STUDIO}" target="_blank" rel="noreferrer">OPEN BANDLAB STUDIO ↗</a><a class="cta outline-light" href="${BANDLAB_INVITE_HELP}" target="_blank" rel="noreferrer">HOW TO INVITE A COLLABORATOR ↗</a></div></div><div class="studio-orbit"><div class="studio-ring r1"></div><div class="studio-ring r2"></div><div class="studio-ring r3"></div><strong>BL</strong><span>RECORD • LAYER • MIX</span></div></div>
      <div class="studio-grid"><article><b>01</b><span>START</span><h3>Player A creates the project.</h3><p>Choose a basic beat/tempo and record the first main instrument. The first part creates direction without completing the whole arrangement.</p></article><article><b>02</b><span>HANDOFF</span><h3>Invite, don't export-and-disappear.</h3><p>Bring Player B into the BandLab collaboration so the project remains shared and both people work from the same song.</p></article><article><b>03</b><span>ANSWER</span><h3>Player B adds what is missing.</h3><p>Listen first. Add a different instrument. The goal is chemistry between two parts, not two solos fighting for the center.</p></article><article><b>04</b><span>RETURN</span><h3>JamBeacon keeps the story.</h3><p>Paste the BandLab project/song link back here so the collaboration stays connected to the musicians who made it.</p></article></div>
      <div class="studio-link-card"><div><span>YOUR CURRENT BANDLAB PROJECT</span><h3>Keep the handoff one tap away.</h3></div><div><input id="bandlabProject" value="${esc(state.bandlabProject)}" placeholder="https://www.bandlab.com/..."><button id="saveBandlab">${state.access==='member'?'SAVE PROJECT LINK':'UNLOCK TO SAVE • $9.99'}</button>${safe?`<a href="${esc(state.bandlabProject)}" target="_blank" rel="noreferrer">Open saved project ↗</a>`:''}</div></div>
      <div class="third-party-note"><b>ABOUT BANDLAB</b><p>BandLab is a third-party music platform and is not owned by or affiliated with JamBeacon. JamBeacon links members there for the recording workflow; each musician uses their own BandLab account and BandLab's terms and privacy rules apply.</p><button data-go="First Song">WATCH FIRST SONG GUIDE →</button></div></section>`;
  }

  function join() {
    const p=state.profile;
    const instrumentOpts=['Guitar','Bass','Drums','Vocals','Keys','Producer','Other'].map(x=>`<option ${p.instrument===x?'selected':''}>${x}</option>`).join('');
    const genreOpts=['Rock','Metal','Country','Blues','Funk','Jazz','R&B','Other'].map(x=>`<option ${p.genre===x?'selected':''}>${x}</option>`).join('');
    return `<section class="join-page"><div class="join-pitch"><span>JOIN JAMBEACON</span><h1>Look around<br>free.<br><em>Jam for $9.99.</em></h1><p>The install stays free. A basic preview identity lets you browse musician pages and watch the First Song guide. The one-time member unlock opens the live networking and collaboration tools.</p><div class="join-includes"><span>✓ Browse musician profiles free</span><span>✓ Watch First Song tutorial free</span><span>✓ Basic preview identity free</span><span>⚡ Live approximate Beacon</span><span>⚡ See active nearby musicians</span><span>⚡ Send jam requests</span><span>⚡ Create/join sessions</span><span>⚡ Guided First Song workflow</span><span>⚡ BandLab project hub</span></div></div>
      <div class="join-card"><span>${state.access==='member'?'MEMBERSHIP ACTIVE':'START WITH A FREE IDENTITY'}</span><h2>${state.access==='member'?"You're in JamBeacon.":'Build your musician card.'}</h2><label>Musician / display name<input id="profileName" value="${esc(p.name)}" placeholder="Your name or stage name"></label><label>Main instrument<select id="profileInstrument">${instrumentOpts}</select></label><label>Main sound<select id="profileGenre">${genreOpts}</select></label><label>General area<input id="profileArea" value="${esc(p.area)}" placeholder="City or general area only"></label><div class="account-box"><span>TEST ACCOUNT</span><label>Email<input id="accountEmail" type="email" value="${esc(state.authEmail)}" placeholder="you@example.com"></label><label>Password<input id="accountPassword" type="password" minlength="6" placeholder="6+ characters"></label><div class="account-actions"><button id="createAccount">CREATE ACCOUNT</button><button id="signInAccount">SIGN IN</button></div><small>${window.JBBackend?.mode==='supabase'?'Connected to live Supabase backend.':'Local test mode — add Supabase keys later to turn these into real cloud accounts.'}</small></div>${state.access==='preview'?'<button class="secondary-wide" id="savePreview">SAVE FREE PREVIEW</button><div class="price-box"><div><span>JAMBEACON MEMBER UNLOCK</span><strong>$9.99</strong></div><small>One-time digital unlock concept. The production Android version will use the required approved billing flow.</small></div><button class="wide-action" id="demoUnlock">TEST $9.99 UNLOCK →</button><p class="terms">TEST BUILD: this does not charge money. It unlocks member mode locally so closed testers can exercise the complete flow.</p>':'<div class="member-confirm"><b>✓ MEMBER TOOLS UNLOCKED</b><span>Beacon • discovery • invites • sessions • First Song • BandLab Studio</span></div><button class="wide-action" data-go="Beacon">TURN ON MY BEACON →</button>'}</div></section>`;
  }

  function inbox() {
    const items = state.inbox;
    const accepted = items.filter(x=>x.status==='accepted');
    const pending = items.filter(x=>x.status==='pending');
    const cards = items.length ? items.map(x=>`<article class="inbox-card ${x.status}"><div><span>${x.status.toUpperCase()}</span><h3>${esc(x.from||'Musician')}</h3><p>${esc(x.note||'Jam request')}</p></div><div class="inbox-actions">${x.status==='pending'?`<button data-respond="accept" data-request-id="${esc(x.id)}">ACCEPT</button><button class="ghost" data-respond="decline" data-request-id="${esc(x.id)}">DECLINE</button>`:`<button data-thread="${esc(x.id)}">OPEN CHAT</button>`}</div></article>`).join('') : '<div class="empty-state"><h3>No jam requests yet.</h3><p>Browse musicians and send a request when somebody looks like a fit.</p><button data-go="Discover">FIND A PLAYER →</button></div>';
    const active = accepted[0];
    const msgs = active ? (state.messages[active.id]||[]) : [];
    return `<section class="page-wrap inbox-page">${pageHead('INBOX','A jam request should become a conversation.','Accept a connection, talk through the plan, choose a safe public meetup or remote handoff, then move into a session and First Song.')}
      <div class="inbox-layout"><div class="request-column"><div class="mini-stat-row"><span><b>${pending.length}</b> pending</span><span><b>${accepted.length}</b> accepted</span><span><b>${state.invites.length}</b> sent</span></div>${cards}</div>
      <aside class="chat-panel">${active?`<span>ACTIVE JAM CHAT</span><h2>${esc(active.from)}</h2><div class="chat-messages">${msgs.length?msgs.map(m=>`<p class="${m.mine?'mine':''}"><b>${m.mine?'YOU':esc(active.from)}</b>${esc(m.body)}</p>`).join(''):'<div class="chat-placeholder">Say hello, compare schedules, then decide whether this jam happens remotely or at a public place.</div>'}</div><div class="chat-compose"><input id="chatMessage" placeholder="Message your jam partner"><button id="sendChat" data-thread-id="${esc(active.id)}">SEND</button></div><button class="session-jump" data-go="Sessions">TURN THIS INTO A SESSION →</button><div class="safety-actions"><button data-report-user="${esc(active.fromId)}">REPORT</button><button data-block-user="${esc(active.fromId)}">BLOCK</button></div>`:'<div class="chat-placeholder big"><b>NO ACCEPTED JAM YET</b><p>Accept a request and the private planning conversation opens here.</p></div>'}</aside></div>
      <div class="safety-strip"><b>JAM SMART</b><span>Exact home/GPS location is never displayed publicly.</span><span>Use public rehearsal spaces or remote collaboration for a first connection.</span><span>Block/report controls are available from accepted jam chats.</span></div></section>`;
  }

  function profile() {
    const p=state.profile; const initials=(p.name||'JB').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
    return `<section class="page-wrap profile-page">${pageHead('MY JAM',esc(p.name||'Your musician identity'),state.access==='member'?'Your member dashboard: Beacon, connections, sessions and collaborative songs.':'Free preview profiles are intentionally simple. Browse first; unlock when you are ready to connect.')}
      <div class="profile-dashboard"><aside><div class="profile-avatar">${esc(initials)}</div><h2>${esc(p.name||'New Musician')}</h2><p>${esc(p.instrument)} • ${esc(p.genre)} • ${esc(p.area)}</p><span class="${state.access==='member'?'member-badge':'preview-badge'}">${state.access==='member'?'JAMBEACON MEMBER':'FREE PREVIEW'}</span><button data-go="Discover">Browse musicians</button></aside><div class="dash-main"><div class="status-board"><article><small>BEACON</small><strong>${state.beaconOn?'LIVE':'OFF'}</strong><button data-go="Beacon">${state.access==='member'?'Manage':'Unlock'}</button></article><article><small>JAM INBOX</small><strong>${state.inbox.filter(x=>x.status==='pending').length}</strong><button data-go="Inbox">Open inbox</button></article><article><small>FIRST SONG</small><strong>${state.firstSong.songLink?'DONE':state.access==='member'?'START':'—'}</strong><button data-go="First Song">Open guide</button></article></div><div class="first-song-shortcut"><span>FIRST COLLAB</span><h3>Found somebody worth jamming with?</h3><p>One player starts in BandLab. The second listens and adds a different instrument. Then bring the song link back to JamBeacon.</p><button data-go="First Song">${state.access==='member'?'START FIRST SONG →':'SEE HOW IT WORKS →'}</button></div><div class="edit-profile"><span>YOUR BASICS</span><label>Display name<input id="editName" value="${esc(p.name)}"></label><label>Instrument<input id="editInstrument" value="${esc(p.instrument)}"></label><label>Genre<input id="editGenre" value="${esc(p.genre)}"></label><label>General area<input id="editArea" value="${esc(p.area)}"></label><button class="wide-action" id="saveProfile">SAVE PROFILE</button><button class="delete-account" id="requestDeletion">REQUEST ACCOUNT DELETION</button></div>${state.access==='preview'?'<div class="upgrade-card"><span>READY TO ACTUALLY JAM?</span><h3>The profiles and tutorial are free. The connection layer is the membership.</h3><button class="cta acid" data-go="Join">Unlock $9.99 →</button></div>':''}</div></div></section>`;
  }

  function render() {
    let content = home();
    if (state.page==='Discover') content=discover();
    if (state.page==='Beacon') content=beacon();
    if (state.page==='Inbox') content=inbox();
    if (state.page==='Sessions') content=sessions();
    if (state.page==='First Song') content=firstSong();
    if (state.page==='Studio') content=studio();
    if (state.page==='Join') content=join();
    if (state.page==='Profile') content=profile();
    document.getElementById('app').innerHTML = `<main class="app-shell">${header()}${content}${footer()}</main>`;
    bind();
  }

  function updateProfileFromJoin() {
    state.profile = {
      name:(document.getElementById('profileName')?.value||'').trim(),
      instrument:document.getElementById('profileInstrument')?.value||'Guitar',
      genre:document.getElementById('profileGenre')?.value||'Rock',
      area:(document.getElementById('profileArea')?.value||'').trim()
    };
    persist();
  }

  function publicBeaconPoint(latitude, longitude) {
    const milesPerDegreeLat=69;
    const milesPerDegreeLng=69*Math.cos(latitude*Math.PI/180);
    const cellMiles=5;
    const northMiles=latitude*milesPerDegreeLat;
    const eastMiles=longitude*milesPerDegreeLng;
    return {latitude:(Math.floor(northMiles/cellMiles)*cellMiles+cellMiles/2)/milesPerDegreeLat,longitude:(Math.floor(eastMiles/cellMiles)*cellMiles+cellMiles/2)/milesPerDegreeLng,privacyRadiusMiles:5};
  }

  function bind() {
    document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.go)));
    document.getElementById('menuBtn')?.addEventListener('click',()=>{state.menu=!state.menu;render();});
    document.querySelectorAll('[data-genre]').forEach(el=>el.addEventListener('click',()=>{state.genre=el.dataset.genre;render();}));
    document.querySelectorAll('[data-musician]').forEach(el=>el.addEventListener('click',()=>{state.selected=el.dataset.musician;render();}));
    document.querySelectorAll('[data-invite]').forEach(el=>el.addEventListener('click',()=>{const id=el.dataset.invite;requireMember(async()=>{if(!inviteSent(id))state.invites.push(id);const r=await window.JBBackend?.sendJamRequest(String(id),'Want to jam and build a song together?');if(r?.error){toast(r.error.message||'Jam request could not be sent.');state.invites=state.invites.filter(v=>String(v)!==String(id));return;}persist();toast('Jam request sent.');render();});}));
    document.getElementById('beaconOn')?.addEventListener('click',()=>requireMember(()=>{
      if(!navigator.geolocation){toast("Location isn't available on this device.");return;}
      toast('Requesting location — the public point will be masked.');
      navigator.geolocation.getCurrentPosition(async pos=>{const result=await window.JBBackend?.setBeacon(pos.coords.latitude,pos.coords.longitude,true);if(result?.error){toast(result.error.message||'Beacon could not be activated.');return;}state.publicPoint=result?.data || publicBeaconPoint(pos.coords.latitude,pos.coords.longitude);state.beaconOn=true;persist();toast('Beacon live. Exact GPS is not shown to other users.');render();},()=>toast("Location permission wasn't granted."),{enableHighAccuracy:false,maximumAge:300000,timeout:10000});
    }));
    document.getElementById('beaconOff')?.addEventListener('click',async()=>{state.beaconOn=false;await window.JBBackend?.disableBeacon();persist();toast("Beacon off. You won't appear live.");render();});
    document.querySelectorAll('[data-session]').forEach(el=>el.addEventListener('click',()=>requireMember(async()=>{const r=await window.JBBackend?.joinSession?.(el.dataset.session);if(r?.error){toast(r.error.message||'Could not join session.');return;}toast('Jam spot request sent.');})));
    document.getElementById('createSession')?.addEventListener('click',()=>requireMember(async()=>{const title=(document.getElementById('sessionTitle')?.value||'').trim();if(!title){toast('Give the jam a name first.');return;}const when=document.getElementById('sessionWhen')?.value||'';const need=document.getElementById('sessionNeed')?.value||'';const created=await window.JBBackend?.createSession?.({title,general_area:state.profile.area||'General area',need,remote_ok:true});state.sessions.unshift({id:created?.data?.id||Date.now(),title,when,need,place:'Location shared after acceptance',members:1});persist();toast('Jam session created.');render();}));

    document.querySelectorAll('[data-first]').forEach(el=>el.addEventListener('change',()=>{state.firstSong[el.dataset.first]=el.value;persist();render();}));
    document.querySelectorAll('[data-first-action]').forEach(el=>el.addEventListener('click',()=>requireMember(async()=>{const a=el.dataset.firstAction;if(a==='open'){window.open(BANDLAB_STUDIO,'_blank','noopener,noreferrer');state.firstSong.step=Math.max(state.firstSong.step,2);toast('BandLab opened. Player A starts the project.');}
      if(a==='invite'){state.firstSong.step=Math.max(state.firstSong.step,3);toast('Handoff marked sent.');}
      if(a==='second'){state.firstSong.step=Math.max(state.firstSong.step,4);toast('Second instrument marked recorded.');}
      if(a==='ready'){state.firstSong.step=Math.max(state.firstSong.step,5);toast('Song marked ready. Bring the BandLab link back.');}
      if(a==='save'){if(!isBandLabUrl(state.firstSong.songLink)){toast('Paste a valid BandLab link first.');return;}state.firstSong.step=5;await window.JBBackend?.saveCollaboration?.({title:'First Song',bandlab_project_url:state.firstSong.projectLink||null,bandlab_song_url:state.firstSong.songLink,status:'finished'});toast('First Song saved to your collaboration record.');}
      persist();render();})));

    document.getElementById('saveBandlab')?.addEventListener('click',()=>requireMember(()=>{const v=(document.getElementById('bandlabProject')?.value||'').trim();if(!isBandLabUrl(v)){toast('Paste a valid bandlab.com project link.');return;}state.bandlabProject=v;persist();toast('BandLab project link saved.');render();}));
    document.getElementById('savePreview')?.addEventListener('click',async()=>{updateProfileFromJoin();if(!state.profile.name){toast('Add your musician name first.');return;}const r=await window.JBBackend?.saveProfile({display_name:state.profile.name,instrument:state.profile.instrument,genre:state.profile.genre,area:state.profile.area,membership:'preview'});if(r?.error&&window.JBBackend?.mode==='supabase'){toast('Create or sign in to an account before publishing your profile.');return;}toast('Free preview profile saved.');go('Profile');});
    document.getElementById('demoUnlock')?.addEventListener('click',()=>{updateProfileFromJoin();if(!state.profile.name){toast('Add your musician name first.');return;}state.access='member';persist();toast('Test membership unlocked — no payment was charged.');go('Beacon');});
    document.getElementById('createAccount')?.addEventListener('click',async()=>{
      updateProfileFromJoin();
      const email=(document.getElementById('accountEmail')?.value||'').trim(); const password=document.getElementById('accountPassword')?.value||'';
      if(!email || password.length<6){toast('Use an email and a password with at least 6 characters.');return;}
      const {error}=await window.JBBackend.signUp(email,password,{display_name:state.profile.name||''});
      if(error){toast(error.message||'Account could not be created.');return;} state.authEmail=email; persist(); const ses=await window.JBBackend.getSession(); if(ses?.data?.session&&state.profile.name)await window.JBBackend.saveProfile({display_name:state.profile.name,instrument:state.profile.instrument,genre:state.profile.genre,area:state.profile.area,membership:'preview'}); toast(window.JBBackend.mode==='supabase'?'Account created. Check email if confirmation is enabled.':'Test account created on this device.');
    });
    document.getElementById('signInAccount')?.addEventListener('click',async()=>{
      const email=(document.getElementById('accountEmail')?.value||'').trim(); const password=document.getElementById('accountPassword')?.value||'';
      if(!email || !password){toast('Enter your email and password.');return;} const {error}=await window.JBBackend.signIn(email,password); if(error){toast(error.message||'Sign in failed.');return;} state.authEmail=email;persist();toast('Signed in.');await refreshAccount();await refreshDirectory();await refreshInbox();await refreshSessions();
    });
    document.querySelectorAll('[data-respond]').forEach(el=>el.addEventListener('click',async()=>requireMember(async()=>{
      const id=el.dataset.requestId; const status=el.dataset.respond==='accept'?'accepted':'declined'; const row=state.inbox.find(x=>String(x.id)===String(id)); if(row) row.status=status; await window.JBBackend?.respondJamRequest(id,status); persist(); toast(status==='accepted'?'Jam request accepted — chat opened.':'Jam request declined.'); render();
    })));
    document.getElementById('sendChat')?.addEventListener('click',async()=>requireMember(async()=>{
      const body=(document.getElementById('chatMessage')?.value||'').trim(); const thread=document.getElementById('sendChat')?.dataset.threadId; if(!body||!thread)return; state.messages[thread]=state.messages[thread]||[]; state.messages[thread].push({body,mine:true,at:Date.now()}); await window.JBBackend?.sendMessage(thread,body); persist(); render();
    }));

    document.querySelectorAll('[data-block-user]').forEach(el=>el.addEventListener('click',async()=>requireMember(async()=>{
      const id=el.dataset.blockUser; const r=await window.JBBackend?.blockUser?.(id); if(r?.error){toast(r.error.message||'Could not block this user.');return;} if(!state.blocked.some(x=>String(x)===String(id)))state.blocked.push(id); state.inbox=state.inbox.filter(x=>String(x.fromId)!==String(id));persist();toast('Musician blocked. Their profile and chat are hidden.');await refreshDirectory();render();
    })));
    document.querySelectorAll('[data-report-user]').forEach(el=>el.addEventListener('click',async()=>requireMember(async()=>{
      const id=el.dataset.reportUser; const note=prompt('Briefly tell JamBeacon what happened (optional):')||''; const r=await window.JBBackend?.reportUser?.(id,note); if(r?.error){toast(r.error.message||'Report could not be sent.');return;}toast('Report submitted for review.');
    })));
    document.getElementById('requestDeletion')?.addEventListener('click',async()=>{
      if(!confirm('Request deletion of your JamBeacon account and turn off your Beacon?'))return; const r=await window.JBBackend?.requestAccountDeletion?.(); if(r?.error){toast(r.error.message||'Deletion request could not be submitted.');return;} state.beaconOn=false;state.access='preview';state.authEmail='';persist();toast('Account deletion request submitted.');go('Home');
    });
    document.getElementById('saveProfile')?.addEventListener('click',async()=>{state.profile={name:(document.getElementById('editName')?.value||'').trim(),instrument:(document.getElementById('editInstrument')?.value||'').trim(),genre:(document.getElementById('editGenre')?.value||'').trim(),area:(document.getElementById('editArea')?.value||'').trim()};persist();await window.JBBackend?.saveProfile({display_name:state.profile.name,instrument:state.profile.instrument,genre:state.profile.genre,area:state.profile.area,membership:state.access});toast('Profile saved.');render();});
  }

  render();
  refreshDirectory();
  refreshAccount();
  refreshInbox();
  refreshSessions();
})();

