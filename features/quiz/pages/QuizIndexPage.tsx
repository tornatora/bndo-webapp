import { redirect } from 'next/navigation';
import { routes } from '@/shared/config';

export default function QuizIndexPage() {
  redirect(routes.quiz.autoimpiego);
}
