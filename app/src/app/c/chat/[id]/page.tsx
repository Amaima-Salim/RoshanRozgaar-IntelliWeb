import { ChatPage } from "@/components/chat/ChatPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ChatPage role="customer" id={(await params).id} />;
}
