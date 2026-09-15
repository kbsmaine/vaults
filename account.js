(async () => {
  'use strict';
  const api = window.NWPortal;
  const status = document.getElementById('accountStatus');
  const views = document.getElementById('authViews');
  const title = document.getElementById('accountTitle');
  const description = document.getElementById('accountDescription');
  let busy = false;
  let pendingGlobalSignOut = false;
  const modes = {
    signin:['Welcome back.','Sign in to pick up where your project left off.'],
    signup:['Make yourself at home.','Create your account, then tell us about your project.'],
    reset:['Let’s get you back in.','We’ll email you a link to choose a new password.'],
    resend:['Check your inbox.','Request a fresh email to confirm your account.'],
    'update-password':['A fresh start.','Choose a new password for your Northwoods account.']
  };
  function message(text,tone='') { status.textContent=text; status.dataset.tone=tone; }
  function show(mode,clear=true) {
    const chosen=modes[mode]?mode:'signin';
    document.querySelectorAll('[data-auth-view]').forEach(form=>{form.hidden=form.dataset.authView!==chosen;});
    title.textContent=modes[chosen][0]; description.textContent=modes[chosen][1];
    document.getElementById('signedIn').hidden=true; views.hidden=false;
    if(clear) message('');
  }
  function errorMessage(error) {
    if(/invalid login credentials/i.test(error.message || '')) return 'The email or password did not match. Please try again.';
    if(/email not confirmed/i.test(error.message || '')) return 'Please confirm your email first. You can request a fresh confirmation link below.';
    if(/rate|too many/i.test(error.message || '')) return 'Please wait a few minutes before trying again.';
    if(/fetch|network/i.test(error.message || '')) return 'We couldn’t connect. Check your internet connection and try again.';
    return error.message || 'Something went wrong. Please try again.';
  }
  async function run(form,work) {
    if(busy || !form.reportValidity()) return;
    busy=true; message('One moment…');
    const data=new FormData(form);
    views.querySelectorAll('button,input').forEach(el=>{el.disabled=true;});
    try { await work(data); }
    catch(error) { message(errorMessage(error),'error'); }
    finally { views.querySelectorAll('button,input').forEach(el=>{el.disabled=false;}); busy=false; }
  }
  function matching(data) { if(data.get('password')!==data.get('confirm')) throw new Error('The passwords don’t match. Please enter them again.'); }
  function bind(id,work) { const form=document.getElementById(id); form.addEventListener('submit',event=>{event.preventDefault();run(form,work);}); }
  if(!api?.configured) {
    document.getElementById('unavailable').hidden=false;
    title.textContent='Your project, connected.'; description.textContent='Customer accounts are on their way.';
    return;
  }
  const auth=api.client.auth;
  const initialHash=new URLSearchParams(window.location.hash.slice(1));
  const initialMode=new URLSearchParams(window.location.search).get('mode');
  let recovery=initialMode==='update-password' || initialHash.get('type')==='recovery';
  auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;show('update-password');}});
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(!busy){show(button.dataset.mode);history.replaceState(null,'','account.html');}}));
  bind('signInForm',async data=>{
    const {error}=await auth.signInWithPassword({email:data.get('email').trim(),password:data.get('password')});
    if(error) throw error;
    window.location.replace('portal.html');
  });
  bind('signUpForm',async data=>{
    matching(data);
    if(!data.get('full_name').trim()) throw new Error('Please enter your name.');
    const {data:created,error}=await auth.signUp({email:data.get('email').trim(),password:data.get('password'),options:{data:{full_name:data.get('full_name').trim()},emailRedirectTo:api.redirectURL('confirmed')}});
    if(error) throw error;
    document.getElementById('signUpForm').reset();
    if(created.session) { window.location.replace('portal.html'); return; }
    show('signin',false); message('Check your inbox for an account confirmation link. If you already have an account, sign in or reset your password.','success');
  });
  bind('resetForm',async data=>{
    const {error}=await auth.resetPasswordForEmail(data.get('email').trim(),{redirectTo:api.redirectURL('update-password')});
    if(error && !/user.not.found|not.registered|email.not.found/i.test(`${error.code || ''} ${error.message || ''}`)) throw error;
    message('If an account uses that email, a reset link is on its way. Check your inbox and spam folder.','success');
  });
  bind('resendForm',async data=>{
    const {error}=await auth.resend({type:'signup',email:data.get('email').trim(),options:{emailRedirectTo:api.redirectURL('confirmed')}});
    if(error && !/user.not.found|not.registered|email.not.found|email.already.confirmed/i.test(`${error.code || ''} ${error.message || ''}`)) throw error;
    message('If this account is awaiting confirmation, a fresh link is on its way. Check your inbox and spam folder.','success');
  });
  bind('passwordForm',async data=>{
    matching(data);
    const {data:session,error:sessionError}=await auth.getSession();
    if(sessionError || !session.session) throw new Error('This reset link has expired. Request a new one from the sign-in page.');
    const {error}=await auth.updateUser({password:data.get('password')});
    if(error) throw error;
    document.getElementById('passwordForm').reset();
    // Revoke refresh tokens on all devices after a password reset.
    const {error:signOutError}=await auth.signOut({scope:'global'});
    recovery=false; history.replaceState(null,'','account.html');
    if(signOutError) {
      pendingGlobalSignOut=true; views.hidden=true; document.getElementById('signedIn').hidden=false;
      title.textContent='Your password is updated.'; description.textContent='Finish signing out to close your existing sessions.';
      document.getElementById('accountSignOut').textContent='Finish signing out';
      message('The password was saved, but signing out of your devices did not finish. Use Finish signing out to try again.','success');
      return;
    }
    show('signin',false); message('Your password has been updated. Sign in with your new password.','success');
  });
  document.getElementById('accountSignOut').addEventListener('click',async event=>{
    event.currentTarget.disabled=true;
    try {
      if(pendingGlobalSignOut) { const {error}=await auth.signOut({scope:'global'}); if(error) throw error; window.location.replace('account.html'); }
      else await api.signOut();
    } catch(error) {message(errorMessage(error),'error');document.getElementById('accountSignOut').disabled=false;}
  });
  try {
    const {data,error}=await auth.getSession();
    if(error || initialHash.get('error')) {
      show('reset'); message('That email link could not be used. Request a new link and try again.','error');
      history.replaceState(null,'','account.html'); return;
    }
    if(window.location.hash) history.replaceState(null,'',window.location.pathname+window.location.search);
    if(recovery) {
      if(data.session) show('update-password');
      else {show('reset');message('Please request a new reset link. The previous link may have expired.','error');}
    } else if(data.session) {
      title.textContent='You’re signed in.'; description.textContent='Your project is ready when you are.';
      views.hidden=true;document.getElementById('signedIn').hidden=false;
      document.getElementById('signedInLabel').textContent=data.session.user.email || 'Customer account';
      if(initialMode==='confirmed') message('Your email is confirmed. You can open your portal.','success');
    } else show(initialMode);
  } catch(error) {show('signin');message(errorMessage(error),'error');}
})();
