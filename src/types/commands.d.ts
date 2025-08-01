export interface Command {
  data: any;
  execute: (interaction: CommandInteraction) => Promise<void>;
  adminOnly?: boolean;
}