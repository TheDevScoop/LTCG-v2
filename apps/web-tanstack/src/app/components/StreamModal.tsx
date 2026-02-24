import { STREAM_BG, TAPE } from "@/lib/blobUrls";

interface StreamModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function StreamModal({ isOpen, onClose }: StreamModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div
                className="relative w-full max-w-lg transform rotate-1 border-4 border-black p-6 md:p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] z-50"
                style={{
                    backgroundImage: `url('${STREAM_BG}')`,
                    backgroundSize: "300px",
                    backgroundColor: "#fff0f5", // Fallback pinkish color
                }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-4 -right-4 w-10 h-10 bg-red-600 border-2 border-black text-white text-2xl font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-transform flex items-center justify-center"
                    style={{ fontFamily: '"Permanent Marker", cursive' }}
                >
                    X
                </button>

                {/* Header */}
                <div className="text-center mb-8 bg-white/90 border-2 border-black p-4 rotate-1 shadow-md">
                    <h2
                        className="text-4xl md:text-5xl font-black text-[#121212] uppercase tracking-tighter"
                        style={{ fontFamily: '"Permanent Marker", cursive' }}
                    >
                        LUNCHTABLE<br />TV NETWORK
                    </h2>
                    <div className="w-full h-1 bg-black mt-2 mb-1" />
                    <div className="w-full h-1 bg-black" />
                </div>

                {/* Options */}
                <div className="space-y-6">
                    {/* Agent Channel */}
                    <a
                        href="https://retake.gg/lunchtable"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group relative"
                    >
                        <div className="absolute inset-0 bg-black translate-x-2 translate-y-2 group-hover:translate-x-3 group-hover:translate-y-3 transition-transform" />
                        <div className="relative bg-cyan-400 border-2 border-black p-4 hover:-translate-y-1 transition-transform flex items-center gap-4">
                            <div className="text-4xl">🤖</div>
                            <div>
                                <h3 className="text-2xl font-black uppercase" style={{ fontFamily: '"Permanent Marker", cursive' }}>Agents Channel</h3>
                                <p className="font-bold text-sm" style={{ fontFamily: '"Special Elite", cursive' }}>Watch our bots battle 24/7</p>
                            </div>
                        </div>
                    </a>

                    {/* Community Stream */}
                    <a
                        href="https://retake.gg/community/lunchtable"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group relative"
                    >
                        <div className="absolute inset-0 bg-black translate-x-2 translate-y-2 group-hover:translate-x-3 group-hover:translate-y-3 transition-transform" />
                        <div className="relative bg-yellow-400 border-2 border-black p-4 hover:-translate-y-1 transition-transform flex items-center gap-4">
                            <div className="text-4xl">📺</div>
                            <div>
                                <h3 className="text-2xl font-black uppercase" style={{ fontFamily: '"Permanent Marker", cursive' }}>Community Streams</h3>
                                <p className="font-bold text-sm" style={{ fontFamily: '"Special Elite", cursive' }}>See who's live right now</p>
                            </div>
                        </div>
                    </a>

                    {/* Signup */}
                    <a
                        href="https://retake.gg/signup"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group relative"
                    >
                        <div className="absolute inset-0 bg-black translate-x-2 translate-y-2 group-hover:translate-x-3 group-hover:translate-y-3 transition-transform" />
                        <div className="relative bg-pink-500 border-2 border-black p-4 hover:-translate-y-1 transition-transform flex items-center gap-4 text-white">
                            <div className="text-4xl">📹</div>
                            <div>
                                <h3 className="text-2xl font-black uppercase" style={{ fontFamily: '"Permanent Marker", cursive' }}>Sign Up To Stream</h3>
                                <p className="font-bold text-sm text-black" style={{ fontFamily: '"Special Elite", cursive' }}>Join the network & get famous</p>
                            </div>
                        </div>
                    </a>
                </div>

                {/* Footer Tape */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-40 h-10 bg-yellow-200/90 rotate-2 border border-black shadow-sm flex items-center justify-center font-black text-xs"
                    style={{
                        fontFamily: '"Special Elite", cursive',
                        backgroundImage: `url('${TAPE}')`,
                        backgroundSize: "cover"
                    }}>
                    NO REFUNDS
                </div>
            </div>
        </div>
    );
}
