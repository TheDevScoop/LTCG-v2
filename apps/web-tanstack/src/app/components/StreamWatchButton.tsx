import { RETRO_TV } from "@/lib/blobUrls";

interface StreamWatchButtonProps {
    onClick: () => void;
}

export function StreamWatchButton({ onClick }: StreamWatchButtonProps) {
    return (
        <button
            onClick={onClick}
            className="group relative w-32 md:w-40 transition-transform hover:scale-110 active:scale-95 outline-none border-none bg-transparent"
            title="Watch Live Streams!"
        >
            {/* Retro TV Icon */}
            <img
                src={RETRO_TV}
                alt="Watch Live"
                className="w-full h-auto drop-shadow-2xl filter contrast-125"
            />

            {/* Screen Glow / Static Overlay */}
            <div className="absolute top-[28%] left-[17%] w-[53%] h-[38%] bg-white/20 mix-blend-overlay animate-pulse rounded-lg pointer-events-none" />

            {/* "LIVE" Badge */}
            <div className="absolute -top-2 -right-4 bg-red-600 text-white font-black px-2 py-1 transform rotate-6 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] z-20"
                style={{ fontFamily: '"Permanent Marker", cursive' }}>
                LIVE!
            </div>
        </button>
    );
}
