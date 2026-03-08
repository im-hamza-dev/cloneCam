import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CamCast – Use Your Phone as a Webcam for Google Meet | No App Needed',
  description:
    'Turn your iPhone or Android into a HD webcam for Google Meet, Zoom, and Teams - instantly over Wi-Fi. No app download. Just scan a QR code. Free.',
  keywords: [
    'use phone as webcam',
    'phone camera google meet',
    'mobile webcam for laptop',
    'iphone webcam google meet',
    'android webcam chrome',
    'wireless webcam browser',
    'phone to laptop camera',
    'virtual webcam chrome extension',
    'webcam without app',
    'use phone camera for zoom',
  ],
  openGraph: {
    title: 'CamCast – Your Phone Camera as a Webcam, Instantly',
    description:
      'Stream your phone camera to Google Meet or Zoom in seconds. No app. No cable. Just Wi-Fi and a QR code scan.',
    type: 'website',
    url: 'https://cam-cast.vercel.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CamCast – Phone Camera to Google Meet in Seconds',
    description:
      'No app download. No USB cable. Use your iPhone or Android as a HD webcam for any video call, right from your browser.',
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does CamCast work with Google Meet?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Install the free CamCast Chrome extension, then select CamCast Camera as your video input inside Google Meet settings. Your phone camera streams live as your webcam.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to download an app on my phone?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. CamCast works entirely in your phone mobile browser. Just scan the QR code shown on your laptop screen - no App Store or Play Store needed.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does it work with Zoom and Microsoft Teams?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Any video conferencing tool that lets you choose a camera source in Chrome will work - including Zoom, Teams, Skype, and Loom.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does it work on iPhone and Android?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. CamCast works on both iPhone (Safari) and Android (Chrome) without any extra configuration.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is CamCast free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The core feature - streaming your phone camera to your laptop - is completely free. The Chrome extension is also free to install.',
      },
    },
    {
      '@type': 'Question',
      name: 'What Wi-Fi setup do I need?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Both your phone and laptop need to be on the same Wi-Fi network. No internet connection is required - video streams locally for the lowest latency.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why use my phone instead of my laptop webcam?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Modern smartphone cameras are significantly better than built-in laptop webcams - sharper, better low-light performance, and you can position your phone anywhere for the best angle.',
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </head>
      <body className="min-h-screen bg-[#080c14] text-slate-100">
        {children}
      </body>
    </html>
  );
}
