/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    localPatterns: [
      {
        pathname: "/images/office-floor-plan.webp",
        search: "?v=map-v2-warm-1911x867"
      }
    ]
  }
};

module.exports = nextConfig;
