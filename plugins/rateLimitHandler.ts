// plugins/rateLimitHandler.ts
export class RateLimitHandler {
    private static instance: RateLimitHandler;
    private monthlyCapExceeded = false;
    private monthlyCapResetTime: number = 0;
    private dailyReadAttempts = 0;
    private lastResetDate: string = '';
    private maxDailyReadAttempts = 50; // Reduced from default to conserve usage
    
    private constructor() {
        this.resetDailyCounterIfNeeded();
    }
    
    static getInstance(): RateLimitHandler {
        if (!RateLimitHandler.instance) {
            RateLimitHandler.instance = new RateLimitHandler();
        }
        return RateLimitHandler.instance;
    }
    
    private resetDailyCounterIfNeeded(): void {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastResetDate !== today) {
            this.dailyReadAttempts = 0;
            this.lastResetDate = today;
            console.log(`📊 Daily read counter reset. Date: ${today}`);
        }
    }
    
    private parseTwitterError(error: any): { isMonthlyCapExceeded: boolean; resetTime?: number } {
        // Check if it's a 429 error with monthly cap exceeded
        if (error.code === 429 && error.data) {
            const { title, detail, type } = error.data;
            
            if (title === 'UsageCapExceeded' && 
                detail?.includes('Monthly product cap') && 
                type === 'https://api.twitter.com/2/problems/usage-capped') {
                
                // Extract reset time from rate limit headers
                const resetTime = error.rateLimit?.reset;
                return { isMonthlyCapExceeded: true, resetTime };
            }
        }
        
        return { isMonthlyCapExceeded: false };
    }
    
    handleTwitterError(error: any): void {
        const { isMonthlyCapExceeded, resetTime } = this.parseTwitterError(error);
        
        if (isMonthlyCapExceeded) {
            this.monthlyCapExceeded = true;
            this.monthlyCapResetTime = resetTime || 0;
            
            const resetDate = new Date(this.monthlyCapResetTime * 1000);
            console.log(`🚫 MONTHLY CAP EXCEEDED! No more read operations until: ${resetDate.toISOString()}`);
            console.log(`📅 Reset timestamp: ${this.monthlyCapResetTime}`);
            console.log(`⏰ Current time: ${Math.floor(Date.now() / 1000)}`);
            
            // Calculate days until reset
            const daysUntilReset = Math.ceil((this.monthlyCapResetTime * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
            console.log(`📊 Days until reset: ${daysUntilReset}`);
        }
    }
    
    canMakeReadRequest(): boolean {
        this.resetDailyCounterIfNeeded();
        
        // Check if monthly cap is exceeded
        if (this.monthlyCapExceeded) {
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime < this.monthlyCapResetTime) {
                const resetDate = new Date(this.monthlyCapResetTime * 1000);
                console.log(`🚫 Monthly cap exceeded. Cannot make read requests until: ${resetDate.toISOString()}`);
                return false;
            } else {
                // Reset time has passed, clear the flag
                this.monthlyCapExceeded = false;
                this.monthlyCapResetTime = 0;
                console.log(`✅ Monthly cap reset! Read operations are now allowed.`);
            }
        }
        
        // Check daily limit to prevent hitting monthly cap again
        if (this.dailyReadAttempts >= this.maxDailyReadAttempts) {
            console.log(`⚠️ Daily read limit reached (${this.maxDailyReadAttempts}). Skipping to preserve monthly quota.`);
            return false;
        }
        
        return true;
    }
    
    incrementReadAttempts(): void {
        this.dailyReadAttempts++;
        console.log(`📊 Daily read attempts: ${this.dailyReadAttempts}/${this.maxDailyReadAttempts}`);
    }
    
    getStatus(): {
        monthlyCapExceeded: boolean;
        resetTime: number;
        dailyAttempts: number;
        maxDailyAttempts: number;
        daysUntilReset: number;
    } {
        const daysUntilReset = this.monthlyCapExceeded ? 
            Math.ceil((this.monthlyCapResetTime * 1000 - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
            
        return {
            monthlyCapExceeded: this.monthlyCapExceeded,
            resetTime: this.monthlyCapResetTime,
            dailyAttempts: this.dailyReadAttempts,
            maxDailyAttempts: this.maxDailyReadAttempts,
            daysUntilReset
        };
    }
    
    setMaxDailyReadAttempts(max: number): void {
        this.maxDailyReadAttempts = max;
        console.log(`📊 Daily read limit updated to: ${max}`);
    }
}