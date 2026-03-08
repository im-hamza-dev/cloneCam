export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-[#080c14] px-5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          © 2025 CamCast. Use your phone as a webcam for Google Meet, Zoom, and
          Teams - no app needed.
        </p>
        <nav
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300"
          aria-label="Footer navigation"
        >
          <a
            href="/how-it-works"
            className="hover:text-slate-100 underline-offset-2 hover:underline"
          >
            How It Works
          </a>
          <a
            href="/chrome-extension"
            className="hover:text-slate-100 underline-offset-2 hover:underline"
          >
            Chrome Extension
          </a>
          <a
            href="/faq"
            className="hover:text-slate-100 underline-offset-2 hover:underline"
          >
            FAQ
          </a>
          <a
            href="/privacy"
            className="hover:text-slate-100 underline-offset-2 hover:underline"
          >
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  );
}
