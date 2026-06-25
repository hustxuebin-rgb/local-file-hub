package middleware

import (
	"net/http"
	"strings"

	"local-file-hub/backend/pkg/jwt"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// skipPaths 跳过认证的路径
var skipPaths = map[string]bool{
	"/api/health":     true,
	"/api/auth/login": true,
}

// Auth JWT 认证中间件
func Auth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if skipPaths[path] {
			c.Next()
			return
		}

		// SPA 静态资源路径放行（非 /api/ 非 /ws）
		if !strings.HasPrefix(path, "/api/") && path != "/ws" {
			c.Next()
			return
		}

		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusOK, response.Response{Code: response.CodeUnauthorized, Msg: "未提供认证token"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusOK, response.Response{Code: response.CodeUnauthorized, Msg: "token格式错误"})
			return
		}

		claims, err := jwt.ParseToken(parts[1], jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusOK, response.Response{Code: response.CodeUnauthorized, Msg: "token无效或已过期"})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("role", claims.Role)
		c.Next()
	}
}
