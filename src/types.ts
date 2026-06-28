export type CivicIssueCategory = 'Pothole' | 'Water Leak' | 'Broken Light' | 'Waste Problem' | 'Other';

export interface GPSLocation {
  latitude: number;
  longitude: number;
}

export interface CivicReport {
  id?: string;
  userId: string;
  photoUrl: string;
  gps: GPSLocation;
  landmark: string;
  category: CivicIssueCategory;
  status: 'Reported' | 'In Progress' | 'Resolved' | 'Verified' | 'Needs Review';
  timestamp: Date | any; // Could be Firebase Timestamp at runtime
  aiDescription?: string;
  citizenDescription?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
  upvote_count: number;
  downvote_count: number;
  upvotedBy: string[];
  downvotedBy: string[];
  afterPhotoUrl?: string;
  video_url?: string;
  videoUrl?: string;
  verifiedAt?: Date | any;
  inProgressAt?: Date | any;
  reopened?: boolean;
  reopenedAt?: Date | any;
  hadNeedsReview?: boolean;
  resolvedGps?: GPSLocation;
  resolvedAt?: Date | any;
}

export interface GroupDrive {
  id?: string;
  landmarkName: string;
  date: string;
  creatorId: string;
  creatorName: string;
  participants: string[];
  minParticipants: number;
  status: 'Open' | 'Confirmed' | 'Completed';
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  completedAt?: Date | any;
}

