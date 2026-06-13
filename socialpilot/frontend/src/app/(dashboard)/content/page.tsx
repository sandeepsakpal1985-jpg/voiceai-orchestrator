'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  BarChart3, TrendingUp, MessageSquare, ThumbsUp, Share2,
  Users, Target, Eye, ArrowUp, ArrowDown, Zap,
} from 'lucide-react';

export default function ContentPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [platform, setPlatform] = useState('all');

  useEffect(() => {
    setLoading(true);
    api.get(`/api/content/top-posts?period=${period}&platform=${platform}&limit=10`)
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period, platform]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const { posts = [], summary = {} } = data || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Intelligence</h1>
          <p className="text-gray-500 mt-1">Top-performing posts by engagement and lead generation</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-primary/10 rounded-lg"><BarChart3 size={16} className="text-primary" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalPosts || 0}</p>
          <p className="text-xs text-gray-500">Posts Analyzed</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-50 rounded-lg"><MessageSquare size={16} className="text-emerald-600" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalComments || 0}</p>
          <p className="text-xs text-gray-500">Total Comments</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-amber-50 rounded-lg"><Target size={16} className="text-amber-600" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalLeads || 0}</p>
          <p className="text-xs text-gray-500">Leads Generated</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-50 rounded-lg"><Zap size={16} className="text-purple-600" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.avgEngagementScore || 0}</p>
          <p className="text-xs text-gray-500">Avg Engagement Score</p>
        </div>
      </div>

      {/* Top Posts Table */}
      {posts.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Top 10 Posts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Unique</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Sentiment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Leads</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {posts.map((post: any, i: number) => (
                  <tr key={post.postId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        post.platform === 'instagram'
                          ? 'bg-pink-50 text-pink-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {post.platform === 'instagram' ? '📸 IG' : '👍 FB'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{post.totalComments}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{post.uniqueCommenters}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {post.sentimentScore > 0 ? `${post.sentimentScore}%` : post.sentimentScore < 0 ? `${post.sentimentScore}%` : 'neutral'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${
                        post.leadsGenerated > 0 ? 'text-emerald-600' : 'text-gray-400'
                      }`}>
                        {post.leadsGenerated}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {post.sentimentScore >= 10 ? (
                          <ArrowUp size={14} className="text-emerald-500" />
                        ) : post.sentimentScore <= -10 ? (
                          <ArrowDown size={14} className="text-red-500" />
                        ) : <span className="w-3.5 inline-block" />}
                        <span className={`text-sm ${
                          post.sentimentScore >= 10 ? 'text-emerald-600' :
                          post.sentimentScore <= -10 ? 'text-red-600' :
                          'text-gray-500'
                        }`}>
                          {post.sentimentScore > 0 ? '+' : ''}{post.sentimentScore}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5"
                            style={{ width: `${Math.min(post.engagementScore / 10, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-500">{post.engagementScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
          <h3 className="font-medium text-gray-900 mb-1">No Post Data Yet</h3>
          <p className="text-sm text-gray-500">
            Once you connect Instagram or Facebook and receive comments, your top-performing posts will appear here.
          </p>
        </div>
      )}

      {/* Post Detail Cards */}
      {posts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Post Performance Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.slice(0, 6).map((post: any, i: number) => (
              <div key={post.postId} className="border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">#{i + 1}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    post.platform === 'instagram'
                      ? 'bg-pink-50 text-pink-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {post.platform}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{post.totalComments}</p>
                    <p className="text-xs text-gray-500">Comments</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{post.leadsGenerated}</p>
                    <p className="text-xs text-gray-500">Leads</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">{post.engagementScore}</p>
                    <p className="text-xs text-gray-500">Score</p>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>💬 {post.totalComments} comments</span>
                  <span>👤 {post.uniqueCommenters} unique</span>
                  <span>📊 Score: {post.engagementScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
