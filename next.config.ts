import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ws ima neobvezne izvorne odvisnosti; naj ga Node naloži sam namesto bundlerja.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
