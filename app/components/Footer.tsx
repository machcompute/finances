import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-mc-dark text-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-10">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="MACH COMPUTING"
                width={32}
                height={32}
              />
              <span className="font-bold text-lg tracking-tight">
                MACH COMPUTING
              </span>
            </div>
            <p className="mt-3 text-white/50 text-sm max-w-xs">
              Personal finance tracking.
            </p>
          </div>
          <div className="flex gap-12">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">
                Navigation
              </h4>
              <div className="flex flex-col gap-2">
                <Link
                  href="/"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Transactions
                </Link>
                <Link
                  href="/summary"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Summary
                </Link>
                <a
                  href="https://machcomputing.com"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Main Site
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">
                Connect
              </h4>
              <div className="flex flex-col gap-2">
                <a
                  href="https://github.com/LukasAfonso"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://www.linkedin.com/in/lu%C3%ADs-carlos-casanova-afonso-8415521b2"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} MACH COMPUTING. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
