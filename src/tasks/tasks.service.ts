import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { TaskSuggestionDto } from './dto/task-suggestion.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private geminiService: GeminiService
  ) {}

  async suggestTasks(sessionId: string): Promise<TaskSuggestionDto[]> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        players: {
          where: { status: { in: ['WAITING', 'PLAYING', 'READY'] } },
          orderBy: { totalWaitTime: 'desc' },
        },
        courts: {
          include: {
            currentMatch: {
              include: {
                players: { include: { player: true } },
              },
            },
          },
        },
        matches: {
          where: { status: 'IN_PROGRESS' },
          take: 5,
        },
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const prompt = this.buildPrompt(session);
    try {
      const responseText = await this.geminiService.generateText(prompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]) as { tasks: TaskSuggestionDto[] };
        return json.tasks || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to generate tasks:', error);
      return [];
    }
  }

  private buildPrompt(session: {
    players: {
      status: string;
      name: string | null;
      level: number | null;
      totalWaitTime: number;
    }[];
    courts: {
      courtNumber: number;
      status: string;
      currentMatch: unknown;
    }[];
  }): string {
    const waitingPlayers = session.players
      .filter((p) => p.status === 'WAITING' || p.status === 'READY')
      .map(
        (p) => `- ${p.name} (Level: ${p.level}, Waited: ${p.totalWaitTime}s)`
      )
      .join('\\n');

    const courts = session.courts
      .map(
        (c) =>
          `- Court ${c.courtNumber}: ${c.status} ${c.currentMatch ? '(Match in progress)' : '(Free)'}`
      )
      .join('\\n');

    return `
      You are a smart badminton session manager.
      Analyze the current session state and suggest 3 actionable tasks to help the host manage the session efficiently.
      Focus on fairness (wait times) and optimizing court usage.

      Current State:
      Waiting Players (prioritize high wait time):
      ${waitingPlayers}

      Courts:
      ${courts}

      Return ONLY a raw JSON object with this structure:
      {
        "tasks": [
          {
            "title": "Short title",
            "description": "Detailed explanation",
            "type": "CREATE_MATCH" | "MOVE_PLAYER" | "OTHER",
            "reason": "Why this is important"
          }
        ]
      }
    `;
  }
}
