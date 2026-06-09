This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Calendar and Weather Sync

This dashboard now includes:

- Weather data from the [Open-Meteo](https://open-meteo.com) API (default set to Maribor, Slovenia)
- Calendar event sync from public ICS calendar URLs
- Task creation and local task storage in the dashboard

To enable the integrations, create a `.env.local` file in the project root and add one or both of the following values:

```env
WEATHER_LAT=37.8136
WEATHER_LON=144.9631
GOOGLE_CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/your_calendar_id/public/basic.ics
OUTLOOK_CALENDAR_ICS_URL=https://outlook.office.com/owa/calendar/your_calendar_id/calendar.ics
```

If calendar URLs are not configured, the dashboard will show built-in sample events.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
