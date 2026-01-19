/* DroneTector — mailto helper (no backend)
   - "Request a demo" button: subject "Demo request"
   - "Get in touch" button: subject "DroneTector — Get in touch" + short body
   - Avoid '+' and literal "\n" rendering by using encodeURIComponent.
   - Uses data-contact-email on <html> when provided.
*/

(function(){
  function $(sel){ return document.querySelector(sel); }

  function getContactEmail(){
    const v = document.documentElement.dataset.contactEmail;
    return (v && v.includes('@')) ? v : 'web-enquiries@dronetector.com';
  }

  // Top-right "Request a demo" button
  const demo = $('[data-demo-mailto]');
  if(demo){
    const to = getContactEmail();
    const subject = 'Demo request';
    const body = [
      'Please include the following information to help us prepare for the demo.',
      '',
      "Copany name:",
      '',
      "Sector:",
      '',
      "Location:",
      '',
      "Your role:",
      '',
      "Calendar availability for a pre-demo call:",
      '',
      "Additional information (Optional):",
      '',
      '—'
    ].join('\n');
    demo.setAttribute('href', `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  // Main CTA button
  const btn = $('[data-mailto-submit]');
  if(!btn) return;

  function buildMailto(){
    const to = getContactEmail();
    const subject = 'Interested in DroneTector';
    const body = [
      'Hi DroneTector team,',
      '',
      "I'd like to chat. Here's some info about me and my calendar availability.",
      '—'
    ].join('\n');

    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  btn.addEventListener('click', function(){
    window.location.href = buildMailto();
  });
})();
