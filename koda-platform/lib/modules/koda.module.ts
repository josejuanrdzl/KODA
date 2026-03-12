/**
 * Defines the contract for KODA feature modules (e.g., Habits, Journal, Finance).
 */
export interface KodaModule {
    /**
     * Unique identifier for the module (e.g., 'habits', 'journal').
     */
    slug: string;

    /**
     * List of intents that this module handles.
     */
    intents?: string[];

    /**
     * Executes the main logic for the module given the user input and context.
     */
    execute(user: any, message: string, context?: any): Promise<any>;

    /**
     * Optionally injects specific rules or context into the main system prompt.
     */
    getSystemPromptContext?(): string;

    /**
     * Define the preconditions required for this module to run (e.g., minimum plan).
     */
    preconditions?: {
        requiredPlan?: string;
        // other preconditions...
    };
}
