import {countablePlaybackEvents,documentViewDistribution,resolveVideoLength,watchTimeSeconds} from './entry.ts';
interface AnalyticsResponse {
  overall: {
    unique_views: number;
    total_views: number;
    total_watch_time: number;
    avg_view_duration: number;
    last_viewed_at: string;
    first_viewed_at: string;
    view_distribution: Array<{
      start_time: number;
      unique_views: number;
      total_views: number;
    }>;
  } | null;
}

export function calculateAnalytics(
  events: Array<{
    timestamp: string;
    view_id: string;
    event_type: string;
    start_time: number;
    end_time: number;
    playback_rate: number;
    volume: number;
    is_muted: number;
    is_focused: number;
    is_fullscreen: number;
  }>,
  videoLength: number,
): AnalyticsResponse {
  if (!events || events.length === 0) {
    return {
      overall: null,
    };
  }

  try {
    const validEvents = countablePlaybackEvents(
      events.filter((event) => event?.view_id && event.start_time >= 0),
    );
    const timelineLength = resolveVideoLength(videoLength, validEvents);
    const uniqueViewIds = new Set(events.map((e) => e.view_id));
    const { total: totalWatchTime } = watchTimeSeconds(validEvents);

    const sortedEvents = [...validEvents].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    return {
      overall: {
        unique_views: uniqueViewIds.size,
        total_views: uniqueViewIds.size,
        total_watch_time: totalWatchTime,
        avg_view_duration:
          uniqueViewIds.size > 0 ? totalWatchTime / uniqueViewIds.size : 0,
        first_viewed_at:
          sortedEvents.length > 0 ? sortedEvents[0].timestamp : "",
        last_viewed_at:
          sortedEvents.length > 0
            ? sortedEvents[sortedEvents.length - 1].timestamp
            : "",
        view_distribution: documentViewDistribution(
          validEvents,
          timelineLength,
        ),
      },
    };
  } catch (error) {
    console.error("Error calculating analytics:", error);
    console.error("Events data:", JSON.stringify(events, null, 2));
    throw error;
  }
}
