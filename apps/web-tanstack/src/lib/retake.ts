const BASE = 'https://retake.tv/api/v1'

export type LiveStreamer = {
  user_id: string
  username: string
  avatar_url?: string
  ticker?: string
  market_cap?: number
  viewer_count?: number
}

export function getRetakeConfig() {
  return {
    apiUrl: import.meta.env.VITE_RETAKE_API_URL || BASE,
    agentName: import.meta.env.VITE_RETAKE_AGENT_NAME || 'milunchlady',
  }
}

export async function getLiveStreams(apiUrl = BASE): Promise<LiveStreamer[]> {
  const res = await fetch(`${apiUrl}/users/live/`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export function streamUrl(agentName: string) {
  return `https://retake.tv/${encodeURIComponent(agentName)}`
}
