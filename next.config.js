/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    localPatterns: [
      {
        pathname: "/images/office-floor-plan.svg",
        search: "?v=map-v3-vector-1911x867"
      }
    ]
  }
};

module.exports = nextConfig;
