/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    localPatterns: [
      {
        pathname: "/images/office-floor-plan.png",
        search: "?v=map-v2-1911x867"
      }
    ]
  }
};

module.exports = nextConfig;
