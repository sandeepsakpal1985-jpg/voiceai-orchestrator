"use client";
import { useState, useEffect } from "react";
import { HelpCircle, Search, RefreshCw, ChevronDown, ChevronRight, ThumbsUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  department?: string;
  category?: string;
  times_asked: number;
  is_published: boolean;
}

export default function FAQManagementPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/faq/`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error("Failed to fetch FAQs");
      const data = await res.json();
      setFaqs(data);
    } catch (err) {
      // Use mock data when backend is unavailable
      setFaqs([
        { id: "1", question: "How do I approve a vendor payment?", answer: "To approve a vendor payment, navigate to Finance > Payments > Pending Approvals. Select the payment and click 'Approve'. You will need Department Admin or higher privileges.", department: "Finance", category: "Payments", times_asked: 45, is_published: true },
        { id: "2", question: "What is the company leave policy?", answer: "Employees are entitled to 18 annual leave days, 12 sick leave days, and 3 personal days per year. Leave must be approved by your manager at least 48 hours in advance. Carry-over of up to 5 days is permitted.", department: "HR", category: "Leave", times_asked: 38, is_published: true },
        { id: "3", question: "How do I onboard a new employee?", answer: "The onboarding process involves: 1) HR setup in the system, 2) IT equipment provisioning, 3) Department mentor assignment, 4) 30-day training plan. Submit a new hire request through the HR portal at least 2 weeks before start date.", department: "HR", category: "Onboarding", times_asked: 28, is_published: true },
        { id: "4", question: "What is the expense reimbursement process?", answer: "Submit expense reports through the Expense Portal with digital receipts. Reports under $500 are auto-approved. Reports over $500 require manager approval. Processing time is 3-5 business days.", department: "Finance", category: "Expenses", times_asked: 32, is_published: true },
        { id: "5", question: "How do I reset my password?", answer: "Go to the login page and click 'Forgot Password'. Enter your work email to receive a reset link. If you don't receive the email within 5 minutes, contact IT Helpdesk.", department: "IT", category: "Account", times_asked: 25, is_published: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFaqs(); }, []);

  const filtered = faqs.filter((faq) =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
          <p className="text-muted-foreground">Auto-generated and curated FAQs from company knowledge</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFaqs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search FAQs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge key={cat} variant="secondary" className="cursor-pointer" onClick={() => setSearchQuery(cat || "")}>
              {cat}
            </Badge>
          ))}
          {searchQuery && (
            <Badge variant="outline" className="cursor-pointer" onClick={() => setSearchQuery("")}>
              Clear filter
            </Badge>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((faq) => (
            <Card
              key={faq.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {expandedId === faq.id ? (
                        <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="font-medium text-sm">{faq.question}</h3>
                    </div>
                    {expandedId === faq.id && (
                      <div className="mt-3 ml-6 space-y-3">
                        <p className="text-sm text-muted-foreground">{faq.answer}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {faq.category && <Badge variant="secondary">{faq.category}</Badge>}
                          {faq.department && <Badge variant="outline">{faq.department}</Badge>}
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {faq.times_asked} asked
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <HelpCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium">No FAQs found</p>
                <p className="text-sm text-muted-foreground mt-1">Try a different search term.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
