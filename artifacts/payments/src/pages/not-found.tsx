import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="text-center max-w-sm"
      >
        <div className="text-xs font-mono uppercase tracking-wide text-neutral-500">
          Error 404
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          We couldn't find that page.
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          The link may be broken or the page may have moved.
        </p>
        <div className="mt-6">
          <Link href="/">
            <Button>Take me home</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
