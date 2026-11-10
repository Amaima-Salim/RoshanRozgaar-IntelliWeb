import { ChatPage } from "@/components/chat/ChatPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ChatPage role="worker" id={(await params).id} />;
}
