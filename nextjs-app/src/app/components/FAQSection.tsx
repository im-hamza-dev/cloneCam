export default function FAQSection() {
  const faqs = [
    {
      q: 'Does CamCast work with Google Meet?',
      a: 'Yes. Install the free CamCast Chrome extension, then select "CamCast Camera" as your video input inside Google Meet settings. Your phone camera streams live as your webcam.',
    },
    {
      q: 'Do I need to download an app on my phone?',
      a: "No. CamCast works entirely in your phone's mobile browser. Just scan the QR code shown on your laptop screen - no App Store, no Play Store.",
    },
    {
      q: 'Does it work with Zoom and Microsoft Teams?',
      a: 'Yes. Any video conferencing tool that lets you choose a camera source in Chrome will work - including Zoom, Teams, Skype, and Loom.',
    },
    {
      q: 'Does it work on iPhone and Android?',
      a: "Yes, CamCast works on both. It uses your browser's native camera API, so any modern iPhone (Safari) or Android (Chrome) works without extra configuration.",
    },
    {
      q: 'Is CamCast free?',
      a: 'The core feature - streaming your phone camera to your laptop - is completely free. The Chrome extension is also free to install.',
    },
    {
      q: 'What Wi-Fi setup do I need?',
      a: 'Both your phone and laptop need to be on the same Wi-Fi network. No internet connection is required - the video streams locally for the lowest possible latency.',
    },
    {
      q: 'Why use my phone instead of my laptop webcam?',
      a: 'Modern smartphone cameras are significantly better than built-in laptop webcams - sharper, better low-light performance, and you can position your phone anywhere for the best angle.',
    },
  ];

  return (
    <section
      className="mx-auto w-full max-w-6xl px-5 pb-10"
      aria-labelledby="faq-heading"
    >
      <h2
        id="faq-heading"
        className="text-xl font-semibold text-slate-100 sm:text-2xl"
      >
        Frequently asked questions
      </h2>
      <dl className="mt-4 space-y-4">
        {faqs.map(({ q, a }) => (
          <div
            key={q}
            className="rounded-xl border border-slate-800 bg-[#0b1220] px-4 py-3"
          >
            <dt className="text-sm font-semibold text-slate-200">{q}</dt>
            <dd className="mt-2 text-sm text-slate-400">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
