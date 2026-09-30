/**
 * The landing pages in English.
 *
 * This is the reference: pt-BR is typed against it, so a key missing there
 * is a compile error rather than a hole in a page.
 *
 * Values are HTML, not text -- they carry their own links and emphasis, and
 * are written with entities for that reason. {{base}} is the language's own
 * root ('' here, '/pt' in Portuguese), so a link stays inside its language.
 */
const WHATSAPP = 'https://wa.me/447866750132'
const APP = 'https://luminabooth-app.web.app'

export const en = {
  // WhatsApp opens with the message already started, and the message names
  // Lumina so it is clear what it is about when it arrives.
  'wa.ask': `${WHATSAPP}?text=${encodeURIComponent("Hi! I'm messaging about Lumina.")}`,
  'wa.price': `${WHATSAPP}?text=${encodeURIComponent(
    'Hi! I found Lumina. How much would the photo booth be for my party?',
  )}`,
  'wa.label': 'Message us on WhatsApp',

  'nav.site': 'Site',
  'nav.more': 'More',
  'nav.home': 'Lumina &mdash; home',
  'nav.openApp': 'Open the app',
  'nav.otherLanguage': 'Portugu&ecirc;s',
  'nav.setup': 'Setup guide',
  'nav.install': 'Save to Home Screen',
  'nav.questions': 'Questions',
  'nav.privacy': 'Privacy',
  'nav.terms': 'Terms',

  'legal.updated': 'Last updated 30 September 2026.',

  // --- the front page ----------------------------------------------------

  'home.title': 'Lumina &mdash; a photo booth for your party',
  'home.description':
    'A phone on a tripod, a small printer, and everyone&rsquo;s own phone. Guests scan, pose, and walk away with a print.',

  'home.hero.heading': 'A photo booth that fits in a tote bag',
  'home.hero.lede':
    'A phone on a tripod, a small printer, and everyone&rsquo;s own phone in their pocket. Guests scan, pose, and walk away holding the photo.',
  'home.hero.fine': 'The app is free while it is new. No card, nothing to install.',
  'home.cta.price': 'Ask for a price',
  'home.cta.app': 'Try the app',
  'home.cta.how': 'See how it works',

  'home.how.heading': 'How it works',
  'home.how.1.title': 'Stand a phone on a tripod',
  'home.how.1.body':
    'Open Lumina on it and tap <em>Use this phone as the booth</em>. Plug the printer in beside it. That is the whole rig.',
  'home.how.2.title': 'Guests scan the code',
  'home.how.2.body':
    'A QR on the table opens on their own phone. They join the queue there, so nobody stands around at the booth waiting for a turn.',
  'home.how.3.title': 'Three shots, one print',
  'home.how.3.body':
    'The booth counts them in and takes three. Moments later it is a 6&times;4 print in their hand and a link on their phone.',

  'home.get.heading': 'What you get',
  'home.get.1.title': 'Prints on the spot',
  'home.get.1.body':
    'Six by four inches, on a dye-sublimation printer, dry to the touch as it comes out. The thing people actually take home.',
  'home.get.2.title': 'No queue at the booth',
  'home.get.2.body':
    'Guests trigger a session from their own phone and the booth calls them up. One booth keeps a long line moving.',
  'home.get.3.title': 'A link that still works',
  'home.get.3.body':
    'Every photo gets its own page. No app, no account, nothing to sign in to &mdash; it opens weeks later on anyone&rsquo;s phone.',
  'home.get.4.title': 'Gone in ninety days',
  'home.get.4.body':
    'Photos are deleted automatically after three months. Guests can also delete their own, at the booth or from their phone.',
  'home.get.5.title': 'Your artwork on it',
  'home.get.5.body':
    'Drop in a background for the party. The layout leaves a corner free for it, so the print looks like yours and not like a template.',
  'home.get.6.title': 'A second pair of hands',
  'home.get.6.body':
    'Invite someone to help run one party. They see that party and nothing else on your account.',

  'home.need.heading': 'What you need',
  'home.need.intro':
    'Lumina is the software. You bring a phone; the rest of the kit is rented from us, in London.',
  'home.need.phone': '<strong>A phone</strong>, to be the booth. Yours.',
  'home.need.tripod': '<strong>A tripod</strong> to stand it on. Ours, rented.',
  'home.need.selphy': '<strong>A Canon SELPHY</strong> photo printer. Ours, rented.',
  'home.need.pi':
    '<strong>A Raspberry Pi</strong> &mdash; a small box beside the printer that drives it. Ours, rented.',
  'home.need.fine':
    'The Pi joins your wifi from a card taped to the box &mdash; no keyboard, no screen, no typing an IP address.',
  'home.need.more': 'Setting it up, step by step',

  'home.price.heading': 'What would it cost for your party?',
  'home.price.1':
    'Ask. It is a WhatsApp message to a person, not a form, and asking commits you to nothing. Tell us the date, where in London, and roughly how many guests, and we will come back with a price.',
  'home.price.2':
    'Not sure it suits your party? Ask that too. Mention Lumina so we know what you are writing about &mdash; the button starts the message for you.',

  'home.faq.heading': 'Questions',
  'home.faq.buy.q': 'Do I have to buy a printer?',
  'home.faq.buy.a':
    'No. We rent out the kit: a Canon SELPHY printer, the Raspberry Pi that drives it, and a tripod for the phone. You supply the phone.',
  'home.faq.where.q': 'Where can I rent the kit?',
  'home.faq.where.a':
    'In London, for now. The app itself works anywhere, but without the kit there are no prints &mdash; guests still get their photos as a link.',
  'home.faq.cost.q': 'How much does the kit cost to rent?',
  'home.faq.cost.a':
    '<a href="{{wa.price}}" target="_blank" rel="noopener">Message us on WhatsApp</a> with your date and rough guest numbers and we will send you a price. The green button in the corner of every page is for anything else &mdash; a question, a comment, or something not working.',
  'home.faq.guests.q': 'Do guests need to install anything?',
  'home.faq.guests.a':
    'No. They scan the QR code and it opens in their phone&rsquo;s browser. No app, no account.',
  'home.faq.app.q': 'Do I need to install an app?',
  'home.faq.app.a':
    'No, Lumina runs in the browser. It is nicer full-screen, though, especially on the phone that is the booth &mdash; <a href="{{base}}/install/">save it to your home screen</a>.',
  'home.faq.wifi.q': 'Does the venue need wifi?',
  'home.faq.wifi.a':
    'Yes. The printer box needs a wifi network with a password you know, and the booth phone needs to be online. A phone hotspot does the job where the venue has none. Wifi that makes you sign in on a web page first, as some hotels do, will not work for the printer.',
  'home.faq.time.q': 'How long does setting up take?',
  'home.faq.time.a':
    'A few minutes once you have the wifi password: plug in, join the printer&rsquo;s setup network, type in a code. The <a href="{{base}}/setup/">setup guide</a> has every step.',
  'home.faq.prints.q': 'How big are the prints, and how fast?',
  'home.faq.prints.a':
    'Six by four inches, with three photos on each. A print takes about a minute, and they come out one at a time in the order people posed.',
  'home.faq.paper.q': 'What if the printer runs out of paper?',
  'home.faq.paper.a':
    'Nothing is lost. Every photo is saved as it is taken and the guest gets their link either way. Your party screen shows the printer&rsquo;s state, and you can print any photo again from there once it is refilled.',
  'home.faq.photos.q': 'What happens to the photos afterwards?',
  'home.faq.photos.a':
    'They are kept for 90 days after the party and then deleted. You can download the lot before then, and any guest can delete their own sooner. The <a href="{{base}}/privacy/">privacy policy</a> has the detail.',
  'home.faq.design.q': 'Can the prints have our own design?',
  'home.faq.design.a':
    'Yes. Upload a background for the party &mdash; landscape, 3:2, ideally 1800&times;1200 &mdash; and it sits behind the photos on every print.',

  'home.closing.heading': 'Run one this weekend',
  'home.closing.body':
    'Sign in with your email. There is no password to make up and nothing to install.',
  'home.closing.cta': 'Get started',

  // --- the setup guide ---------------------------------------------------

  'setup.title': 'Setting up the booth &mdash; Lumina',
  'setup.description':
    'Step by step: the rented printer kit, the phone on the tripod, and the code on the table.',
  'setup.heading': 'Setting up the booth',
  'setup.lede':
    'From the kit in your hands to the first print. Allow a quarter of an hour, and do it at the venue, on the wifi you will use on the day.',

  'setup.kit.heading': 'What is in the kit',
  'setup.kit.intro': 'The kit is rented from Lumina, in London. It holds three things:',
  'setup.kit.selphy':
    '<strong>A Canon SELPHY</strong> &mdash; the photo printer. It makes the 6&times;4 prints.',
  'setup.kit.pi':
    '<strong>A Raspberry Pi</strong> &mdash; the small box wired to the printer. It fetches each photo and hands it to the SELPHY. It has no screen and no buttons you need.',
  'setup.kit.tripod': '<strong>A tripod</strong> &mdash; to hold the booth phone sideways.',
  'setup.kit.card':
    'On the box is a card with a QR code and a three-word name, something like <em>popcorn-sherbet-dance</em>. You will need both.',

  'setup.bring.heading': 'What you bring',
  'setup.bring.phone': '<strong>A phone</strong> to be the booth, and its charger.',
  'setup.bring.wifi': '<strong>The wifi name and password</strong> for the venue.',
  'setup.bring.own': '<strong>Your own phone</strong>, to do the setting up from.',

  'setup.steps.heading': 'Step by step',
  'setup.steps.1.title': 'Create the party in the app',
  'setup.steps.1.body': `On your own phone, open <a href="${APP}">the app</a>, sign in with your email and tap <em>New event</em>. Give it a name and a date.`,
  'setup.steps.2.title': 'Plug in the kit',
  'setup.steps.2.body':
    'Plug in the Pi and the SELPHY, check the cable between them is in, and turn the printer on. Make sure it has paper and ink loaded. Give the Pi a minute or two to start.',
  'setup.steps.3.title': 'Get a pairing code',
  'setup.steps.3.body':
    'In your event, under <em>Booth and printer</em>, tap <em>Connect a printer</em>, then <em>Set up a new printer</em>. The app shows a pairing code. It lasts 15 minutes and works once; tap it to copy.',
  'setup.steps.4.title': 'Join the printer&rsquo;s own network',
  'setup.steps.4.body':
    'In your phone&rsquo;s wifi settings, join the network with the three-word name from the card. It has no password. This is a temporary network the Pi makes just for setting up.',
  'setup.steps.5.title': 'Scan the card',
  'setup.steps.5.body':
    'Scan the QR code on the card, or type <strong>lumina.local</strong> into your browser. Choose the venue&rsquo;s wifi, enter its password, and paste the pairing code.',
  'setup.steps.6.title': 'Watch the setup network disappear',
  'setup.steps.6.body':
    'The Pi joins the venue&rsquo;s wifi and its own network vanishes. That is what success looks like. Your phone goes back to its usual wifi, and the printer shows as connected in your event.',
  'setup.steps.7.title': 'Stand the booth phone on the tripod',
  'setup.steps.7.body':
    'Sideways &mdash; the booth takes landscape photos. Plug it in to charge. Open the app on it, sign in, open the event and tap <em>Use this phone as the booth</em>. Leave that screen open. <a href="{{base}}/install/">Saving the app to the home screen</a> first makes it full-screen.',
  'setup.steps.8.title': 'Start the event and take a test photo',
  'setup.steps.8.body':
    'Tap <em>Start the event</em>, then tap the booth screen and pose. Three shots, and about a minute later a print. If it comes out, you are done.',
  'setup.steps.9.title': 'Put the QR code on the table',
  'setup.steps.9.body':
    'Print the <em>Guest QR code</em> from your event and stand it where people will see it. Guests scan it to join the queue from their own phone; it is on the booth screen too.',

  'setup.help.heading': 'If something is not working',
  'setup.help.network.q': 'I cannot see the three-word network',
  'setup.help.network.a':
    'Give the Pi a couple of minutes after plugging it in, then look again. If it still is not there, unplug the Pi, plug it back in and wait.',
  'setup.help.local.q': 'lumina.local will not open',
  'setup.help.local.a':
    'Your phone has probably hopped back to another network. Check in wifi settings that it is still on the three-word one, then try again.',
  'setup.help.expired.q': 'It says the code has expired',
  'setup.help.expired.a':
    'Codes last 15 minutes and work once. Go back to the app, make a new one, and enter that.',
  'setup.help.back.q': 'The setup network came back',
  'setup.help.back.a':
    'The Pi could not join the wifi, nearly always because of a mistyped password. Join the three-word network again and repeat from step 3 with a new code.',
  'setup.help.noprint.q': 'The photo was taken but nothing printed',
  'setup.help.noprint.a':
    'Look at the printer in your event: it shows what the printer itself is reporting. Usually it is paper, ink, or the printer being switched off. Fix that, then print the photo again from the event.',
  'setup.help.else.q': 'None of that helped',
  'setup.help.else.a':
    '<a href="{{wa.ask}}" target="_blank" rel="noopener">Message us on WhatsApp</a> and say what you are seeing.',

  // --- save to home screen -----------------------------------------------

  'install.title': 'Save Lumina to your Home Screen',
  'install.description':
    'How to add Lumina to the home screen on iPhone and Android, so it opens full-screen like an app.',
  'install.heading': 'Save Lumina to your Home Screen',
  'install.lede':
    'Lumina runs in the browser, so there is nothing in the App Store. Saving it to the home screen gives it an icon and opens it full-screen, without the address bar &mdash; worth doing on the phone that will be the booth.',
  'install.open': `Go to <a href="${APP}">luminabooth-app.web.app</a>.`,

  'install.ios.heading': 'On an iPhone or iPad',
  'install.ios.1.title': 'Open the app in Safari',
  'install.ios.2.title': 'Tap Share',
  'install.ios.2.body': 'The square with an arrow pointing up, in Safari&rsquo;s toolbar.',
  'install.ios.3.title': 'Tap <em>Add to Home Screen</em>',
  'install.ios.3.body':
    'Scroll down the list if you do not see it straight away. Then tap <em>Add</em>.',
  'install.ios.4.title': 'Open Lumina from its icon',
  'install.ios.4.body':
    'The first time, you will be asked to sign in again, even if you were signed in in Safari. After that it remembers you.',

  'install.android.heading': 'On Android',
  'install.android.1.title': 'Open the app in Chrome',
  'install.android.2.title': 'Open the menu',
  'install.android.2.body': 'The three dots at the top right.',
  'install.android.3.title': 'Tap <em>Add to Home screen</em>',
  'install.android.3.body':
    'On some phones it says <em>Install app</em> instead. Confirm, and the icon appears with your other apps.',

  'install.next.heading': 'Next: set up the booth',
  'install.next.body': 'The printer, the tripod and the code on the table, in order.',

  // --- privacy -----------------------------------------------------------

  'privacy.title': 'Privacy policy &mdash; Lumina',
  'privacy.description':
    'What Lumina keeps about hosts and guests, where it is stored, and when it is deleted.',
  'privacy.heading': 'Privacy policy',
  'privacy.lede':
    'What we keep, why, where it lives and when it is deleted. Written to be read, not to be scrolled past.',
  'privacy.body': `
          <h2>The short version</h2>
          <ul>
            <li>Guests need no account and we never ask for their name.</li>
            <li>Photos are deleted automatically 90 days after the party.</li>
            <li>Anyone can delete their own photo sooner.</li>
            <li>There is no advertising and no tracking, here or in the app.</li>
            <li>We do not sell anything we hold, and we do not use photos for anything except giving them to the people in them.</li>
          </ul>

          <h2>Who we are</h2>
          <p>
            Lumina is a photo booth service run from London, in the United Kingdom. For
            the information described here we are the &ldquo;controller&rdquo; in the
            sense of UK data protection law. The quickest way to reach us about any of it
            is <a href="{{wa.ask}}" target="_blank" rel="noopener">WhatsApp</a>.
          </p>

          <h2>If you are a guest at a party</h2>
          <p>
            <strong>Your photos.</strong> The booth takes three shots and joins them into
            one picture. We store both: the three separate shots for 30 days, and the
            finished picture until 90 days after the date of the party. After that they
            are deleted automatically.
          </p>
          <p>
            <strong>Your link.</strong> Each picture has its own page at an address that
            is long and random. Anyone who has the link can open it, so share it as you
            would the photo itself. Those pages are marked so that search engines do not
            list them.
          </p>
          <p>
            <strong>Your email address, only if you give it.</strong> If you ask for a
            photo to be emailed, we use the address to send it and keep a record of where
            it went, so the host can see whether it arrived. We do not use it for anything
            else.
          </p>
          <p>
            <strong>Your place in the queue.</strong> When you scan the code, your phone
            keeps a small token in its browser storage so the booth knows which turn is
            yours and which photo you may delete. It identifies the visit, not you.
          </p>
          <p>
            <strong>Deleting.</strong> You can delete your photo at the booth straight
            after it is taken, or later from the page your link opens. The host can delete
            it too. If you have lost the link, message us or ask the host.
          </p>

          <h2>If you are hosting a party</h2>
          <p>
            <strong>Your account.</strong> Your email address, and a name if you add one.
            You sign in with a six-digit code we email you; there is no password. We keep
            the code only in scrambled form and it expires after ten minutes.
          </p>
          <p>
            <strong>Your events.</strong> The name and date of each party, any artwork you
            upload, the photos taken at it, what was printed, and the email addresses of
            anyone you invite to help run it.
          </p>
          <p>
            <strong>Your devices.</strong> Which phone is acting as the booth and which
            printer is connected, and when each was last seen, so your event screen can
            tell you if one has dropped off.
          </p>
          <p>
            <strong>Emails from us.</strong> Sign-in codes, and a warning 14 days and 3
            days before a party&rsquo;s photos are deleted, with a link to download them.
            Nothing else.
          </p>

          <h2>If you message us</h2>
          <p>
            Messages sent from the buttons on this site go through WhatsApp, which handles
            them under its own terms and privacy policy. We see your phone number, your
            WhatsApp name and whatever you write, and use them only to answer you.
          </p>

          <h2>Cookies and storage</h2>
          <p>
            These pages set no cookies and load nothing from anyone else. The app keeps
            you signed in using your browser&rsquo;s own storage, and the guest page keeps
            the queue token described above. Neither is used to follow you anywhere.
          </p>

          <h2>Who else handles it</h2>
          <p>We use three companies to run the service. They act on our instructions:</p>
          <ul>
            <li><strong>Google Cloud</strong> &mdash; runs the service and stores the photos, in London.</li>
            <li><strong>Neon</strong> &mdash; the database, also in London.</li>
            <li>
              <strong>Resend</strong> &mdash; sends our email. It is based in the United
              States, so an email address we send to is processed there, under the
              safeguards UK law requires for that.
            </li>
          </ul>
          <p>We share nothing with anyone else unless the law obliges us to.</p>

          <h2>Why we are allowed to</h2>
          <p>
            For hosts, because we cannot provide the service you signed up for without it.
            For guests, because taking and handing over the photo is what you walked up to
            the booth for, and we keep it no longer than it takes to be useful. Where we
            email you a photo, because you asked.
          </p>

          <h2>Children</h2>
          <p>
            Parties have children at them. The booth does not ask who is in the picture
            and we make no use of photos beyond storing and showing them. The host is
            responsible for making sure the adults responsible for any children are happy
            for photos to be taken. A parent or guardian can ask us to delete a photo of
            their child at any time.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask us for a copy of what we hold about you, to correct it, or to
            delete it, and you can object to how we use it. Message us and we will deal
            with it within a month. If you are unhappy with the answer, you can complain
            to the Information Commissioner&rsquo;s Office at
            <a href="https://ico.org.uk" rel="noopener">ico.org.uk</a>.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes in a way that matters, we will say so here and change
            the date at the top. Hosts will also be told by email.
          </p>`,

  // --- terms -------------------------------------------------------------

  'terms.title': 'Terms of use &mdash; Lumina',
  'terms.description': 'The terms for using the Lumina app and renting the photo booth kit.',
  'terms.heading': 'Terms of use',
  'terms.lede':
    'What you can expect from us and what we ask of you. Using Lumina means you agree to these.',
  'terms.body': `
          <h2>What Lumina is</h2>
          <p>
            Lumina is software that turns a phone into a photo booth, and a kit &mdash; a
            printer, the small computer that drives it, and a tripod &mdash; that we rent
            out in London. These terms cover both. &ldquo;We&rdquo; is Lumina, run from
            London, United Kingdom.
          </p>

          <h2>Your account</h2>
          <p>
            You need an email address to host a party. You are responsible for what
            happens under your account, including anything done by people you invite to
            help. Guests need no account.
          </p>

          <h2>What we ask of hosts</h2>
          <ul>
            <li>Tell your guests there is a photo booth, and that photos are stored and can be deleted.</li>
            <li>Where children are present, make sure the adults responsible for them are happy for photos to be taken.</li>
            <li>Only upload artwork you have the right to use.</li>
            <li>Do not use Lumina for anything unlawful, or to photograph people who have not agreed to it.</li>
          </ul>

          <h2>The photos</h2>
          <p>
            Photos belong to the people who took them and the people in them, not to us.
            We store them so they can be printed, shared and downloaded, and for no other
            purpose. They are deleted 90 days after the date of the party, and we cannot
            bring them back after that &mdash; download anything you want to keep. The
            <a href="{{base}}/privacy/">privacy policy</a> has the detail.
          </p>
          <p>
            We may remove a photo or close an account that breaks these terms or the law.
          </p>

          <h2>Price</h2>
          <p>
            The app is free while it is new. If that changes, we will tell you before it
            does, and nothing you have already done will be charged for afterwards.
          </p>

          <h2>Renting the kit</h2>
          <p>
            Rental is arranged by message. Before you commit, we will tell you in writing
            the price, the dates, how the kit gets to you and back, and what is included.
            That message, together with this section, is the agreement for that rental.
          </p>
          <ul>
            <li>The kit stays ours. Please return it, on the agreed date, as it arrived.</li>
            <li>You are responsible for it while you have it. If it comes back damaged or does not come back, we may charge the cost of repairing or replacing it.</li>
            <li>Use it indoors, keep it dry, and do not open the printer or the box beside it.</li>
            <li>If the kit is faulty when it reaches you, tell us straight away and we will put it right or refund the rental.</li>
          </ul>

          <h2>What we cannot promise</h2>
          <p>
            Lumina depends on things we do not control: the venue&rsquo;s wifi, the power,
            a phone&rsquo;s camera and battery. We work to keep the service running, and
            we will help if something goes wrong on the day, but we cannot promise it will
            never be interrupted, and we are not responsible for a party that did not go
            as planned because of it.
          </p>
          <p>
            If we are at fault, what we owe you is limited to what you paid us for the
            rental concerned. Nothing here limits our liability for death or personal
            injury caused by our negligence, for fraud, or for anything else the law does
            not allow to be limited. If you are a consumer, your statutory rights are not
            affected.
          </p>

          <h2>Ending it</h2>
          <p>
            You can stop using Lumina at any time, and ask us to delete your account and
            everything in it. We may suspend or close an account that breaks these terms.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms. If a change matters, we will tell hosts by email
            before it takes effect and change the date at the top.
          </p>

          <h2>Law</h2>
          <p>
            These terms are governed by the law of England and Wales, and its courts
            decide any dispute about them. If you live elsewhere in the United Kingdom,
            you can also bring a claim where you live.
          </p>

          <h2>Contact</h2>
          <p>
            <a href="{{wa.ask}}" target="_blank" rel="noopener">Message us on WhatsApp</a>.
          </p>`,
} as const
